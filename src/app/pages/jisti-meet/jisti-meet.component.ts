import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertService } from 'src/app/_shared/alert/alert.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { SocketService } from 'src/app/core/services/socket.service';
import { UserService } from 'src/app/core/services/user.service';

@Component({
  selector: 'app-jisti-meet',
  templateUrl: './jisti-meet.component.html',
  styleUrls: ['./jisti-meet.component.scss']
})
export class JistiMeetComponent implements OnInit, OnDestroy {
  private domain = '8x8.vc/vpaas-magic-cookie-a0a921fbd4364c1d8c15b1151dfc4fe2';
  private roomName!: string;
  private api: any;
  loading = true;
  error: string | null = null;
  private token: string | null = null;
  private participantCount = 0;
  private callEndedMessageSent = false;
  private callInitiatorId!: string;


  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private userService: UserService,
    private alertService: AlertService,
    private socketService: SocketService

  ) { }

  ngOnInit(): void {
    this.roomName = this.route.snapshot.params['groupId'];
    this.callInitiatorId = this.route.snapshot.queryParams['initiatorId'];
    this.initializeConference();
  }

  ngOnDestroy(): void {
    this.cleanUp();
  }

  private async initializeConference(): Promise<void> {
    try {
      await this.checkRoomAccess();
      this.startConference();
      this.loading = false;
    } catch (error) {
      console.error('Error initializing conference:', error);
      this.alertService.error(`Conference initialization failed: ${error || 'Unknown error'}`);
      this.error = 'Failed to initialize video conference';
      this.loading = false;
      this.router.navigate(['/chat'], { replaceUrl: true });
    }
  }

  private async loadJitsiScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).JitsiMeetExternalAPI) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://8x8.vc/vpaas-magic-cookie-a0a921fbd4364c1d8c15b1151dfc4fe2/external_api.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = (err) => reject(err);
      document.body.appendChild(script);
    });
  }


  private checkRoomAccess(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.userService.getJitsiToken(this.roomName)
        .subscribe({
          next: (response: any) => {
            if (response.status && response.allowed) {
              this.token = response.jwt;
              resolve();
            } else {
              reject(new Error(response.message || 'Access denied'));
            }
          },
          error: (err) => reject(err)
        });
    });
  }

  private async startConference(): Promise<void> {
    await this.loadJitsiScript();

    if (!(window as any).JitsiMeetExternalAPI) {
      throw new Error('JitsiMeetExternalAPI not loaded');
    }
    const user = this.authService.getLoggedInUser();

    const options = {
      roomName: this.roomName,
      width: '100%',
      height: '100%',
      parentNode: document.querySelector('#jaas-container'),
      jwt: this.token,
      userInfo: {
        email: user?.email,
        displayName: user?.username,
        avatar: user?.avatar,
      },
      configOverwrite: {
        startWithAudioMuted: true,
        startWithVideoMuted: false,
        disableSimulcast: false,
        enableNoisyMicDetection: true,
        prejoinPageEnabled: false
      },
      interfaceConfigOverwrite: {
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: true,
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
          'fodeviceselection', 'hangup', 'profile', 'recording',
          'livestreaming', 'settings', 'raisehand', 'videoquality', 'tileview', 'select-background'
        ]
      }
    };

    this.api = new (window as any).JitsiMeetExternalAPI(this.domain, options);
    this.api.addListener('readyToClose', () => this.leaveCall());
    this.api.addListener('participantJoined', (data: any) => this.onParticipantJoined(data));
    this.api.addListener('participantLeft', (data: any) => this.onParticipantLeft(data));
    this.api.addListener('videoConferenceJoined', (data: any) => this.onConferenceJoined(data));
  }


  private sendCallEndedMessage(): void {
    const loggedInUser = this.authService.getLoggedInUser();
    const messageData: any = {
      user: {
        _id: loggedInUser._id,
        username: loggedInUser.username,
        email: loggedInUser.email,
        avatar: loggedInUser.avatar,
        isOnline: loggedInUser.isOnline,
        lastSeen: loggedInUser.lastSeen
      },
      conversationId: this.roomName,
      content: 'Call Ended.',
      type: 'call',
      createdAt: new Date().toISOString()
    };
    this.socketService.sendGroupMessage(messageData);
  }

  private cleanUp(): void {
    if (this.api) {
      this.api.dispose();
    }
  }


  private leaveCall(): void {
    const localUserId = this.authService.getLoggedInUser()?._id;

    if (localUserId === this.callInitiatorId && !this.callEndedMessageSent) {
      this.callEndedMessageSent = true;
      this.sendCallEndedMessage();
    }

    this.cleanUp();
    this.router.navigate(['/chat'], { replaceUrl: true });
  }


  private onParticipantJoined(data: any): void {
    this.participantCount++;

    console.log('Participant joined:', data);
  }

  private onParticipantLeft(data: any): void {
    console.log('Participant left:', data);

    setTimeout(() => {
      const participants = this.api.getParticipantsInfo();

      if (participants.length === 1) {
        const localUserId = this.authService.getLoggedInUser()?._id;

        if (localUserId === this.callInitiatorId && !this.callEndedMessageSent) {
          this.callEndedMessageSent = true;
          this.sendCallEndedMessage();
        }
      }
    }, 1000);
  }


  private onConferenceJoined(data: any): void {
    this.participantCount = this.api.getParticipantsInfo()?.length || 1;
    console.log('Conference joined:', data);
  }

}