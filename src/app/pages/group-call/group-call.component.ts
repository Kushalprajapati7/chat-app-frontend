import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from '../../core/services/user.service';
import { AlertService } from 'src/app/_shared/alert/alert.service';

@Component({
  selector: 'app-group-call',
  templateUrl: './group-call.component.html',
  styleUrls: ['./group-call.component.scss']
})
export class GroupCallComponent implements OnInit, OnDestroy {
  @ViewChild("localVideo") localVideo!: ElementRef;
  @ViewChild("remoteVideos") remoteVideosContainer!: ElementRef;

  participants: { userId: string, username?: string, userAvatar?: string, stream: MediaStream }[] = [];
  peerConnections: { [key: string]: RTCPeerConnection } = {};

  groupId!: string;

  screenStream: MediaStream | null = null;
  localStream!: MediaStream;

  isCallInitiator: boolean = false;
  isMuted: boolean = false;
  isVideoEnabled: boolean = true;
  isScreenSharing: boolean = false;

  private iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.l.google.com:5349" },
      { urls: "stun:stun1.l.google.com:3478" },
      { urls: "stun:stun1.l.google.com:5349" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:5349" },
      { urls: "stun:stun3.l.google.com:3478" },
      { urls: "stun:stun3.l.google.com:5349" },
      { urls: "stun:stun4.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:5349" },
      {
        urls: "stun:stun.l.google.com:19302",
        credential: "kushal123",
        username: "kushal123"
      },
      {
        urls: "stun:stun.l.google.com:19302",
        credential: "kushal124",
        username: "kushal124"
      }
    ]
  };

  constructor(
    private socketService: SocketService,
    public authService: AuthService,
    private alertService: AlertService,
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService
  ) { }

  async ngOnInit() {
    this.groupId = this.route.snapshot.params['groupId'];
    this.isCallInitiator = this.route.snapshot.queryParams['initiator'] === 'true';

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      this.setupLocalVideo();

      if (this.isCallInitiator) {
        this.startGroupCall();
      } else {
        this.joinGroupCall();
      }

      this.setupSocketListeners();
    } catch (error) {
      console.error('Error initializing group call:', error);
      this.alertService.error(`Failed to start group call: ${error || 'Unknown error'}`);
      this.router.navigate(['/chat'], { replaceUrl: true });
    }
  }

  ngOnDestroy() {
    this.leaveCall();
  }

  private setupLocalVideo() {
    if (this.localVideo?.nativeElement) {
      this.localVideo.nativeElement.srcObject = this.localStream;
      this.localVideo.nativeElement.muted = true;
    }
  }

  private async startGroupCall() {
    this.socketService.startGroupCall(this.groupId, this.authService.getLoggedInUser()._id);
  }

  private async joinGroupCall() {
    this.socketService.joinGroupCall(this.groupId, this.authService.getLoggedInUser()._id);
  }

  private setupSocketListeners() {
    this.socketService.onGroupCallParticipantJoined().subscribe(async (data) => {
      const { userId } = data;
      if (userId === this.authService.getLoggedInUser()._id) return;
      await this.createPeerConnection(userId);

      if (this.isCallInitiator) {
        await this.sendOffer(userId);
      }

      if (this.participants.length > 0) {
        this.participants.forEach(async participant => {
          if (participant.userId !== userId) {
            await this.createPeerConnection(participant.userId);
            await this.sendOffer(participant.userId);
          }
        });
      }
    });

    this.socketService.onGroupCallOffer().subscribe(async (data) => {
      const { fromUserId, offer } = data;

      const pc = await this.createPeerConnection(fromUserId);
      if (!pc) {
        console.log('Peer connection not created');
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socketService.sendGroupCallAnswer(this.groupId, fromUserId, answer);
    });

    this.socketService.onGroupCallAnswer().subscribe(async (data) => {
      const { fromUserId, answer } = data;
      const pc = this.peerConnections[fromUserId];
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } else {
        console.warn('Skipping setting remote answer: Invalid state or no peer connection');
      }
    });

    this.socketService.onGroupCallIceCandidate().subscribe((data) => {
      const { fromUserId, candidate } = data;
      const pc = this.peerConnections[fromUserId];
      if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    this.socketService.onGroupCallParticipantLeft().subscribe((data) => {
      const { userId } = data;

      Object.keys(this.peerConnections).forEach(peerId => {
        if (peerId === userId) {
          this.peerConnections[peerId].close();
          delete this.peerConnections[peerId];
        }
      });
      this.participants = this.participants.filter(p => p.userId !== userId);
    });
  }

  private async createPeerConnection(userId: string) {
    if (this.peerConnections[userId]) return;

    const pc = new RTCPeerConnection(this.iceServers);
    this.peerConnections[userId] = pc;

    this.localStream.getTracks().forEach(track => {
      pc.addTrack(track, this.localStream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socketService.sendGroupCallIceCandidate(this.groupId, userId, event.candidate);
      }
    };

    pc.ontrack = (event) => {
      this.handleRemoteStream(userId, event.streams[0]);
    };

    return pc;
  }

  private async sendOffer(userId: string) {
    const pc = this.peerConnections[userId];
    if (!pc) return;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socketService.sendGroupCallOffer(this.groupId, userId, offer);
  }

  private handleRemoteStream(userId: string, stream: MediaStream) {
    const existingParticipant = this.participants.find(p => p.userId === userId);
    if (existingParticipant) {
      existingParticipant.stream = stream;
    } else {
      this.participants.push({ userId, stream });
      this.fetchAndAttachUsername(userId);
    }
  }

  private removeParticipant(userId: string) {
    this.participants = this.participants.filter(p => p.userId !== userId);
    if (this.peerConnections[userId]) {
      this.peerConnections[userId].close();
      delete this.peerConnections[userId];
    }
  }

  async toggleScreenShare() {
    if (this.isScreenSharing) {
      await this.stopScreenShare();
    } else {
      await this.startScreenShare();
    }
  }

  private fetchAndAttachUsername(userId: string) {
    this.userService.getUserById(userId).subscribe({
      next: (userData) => {
        const participant = this.participants.find(p => p.userId === userId);
        if (participant) {
          participant.username = userData.data.username;
        }
      },
      error: (error) => {
        this.alertService.warning(`Failed to fetch username for userId: ${error || 'Unknown error'}`);
      }
    });
  }

  async startScreenShare() {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      Object.keys(this.peerConnections).forEach(userId => {
        const pc = this.peerConnections[userId];
        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(this.screenStream!.getVideoTracks()[0]);
        }
      });

      this.isScreenSharing = true;
      this.screenStream.getVideoTracks()[0].onended = () => this.stopScreenShare();
    } catch (error) {
      console.error('Error starting screen share:', error);
      this.alertService.error(`Failed to start screen sharing: ${error || 'Unknown error'}`);
    }
  }

  async stopScreenShare() {
    if (!this.isScreenSharing) return;

    this.screenStream?.getTracks().forEach(track => track.stop());

    Object.keys(this.peerConnections).forEach(userId => {
      const pc = this.peerConnections[userId];
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (videoSender && this.localStream) {
        videoSender.replaceTrack(this.localStream.getVideoTracks()[0]);
      }
    });

    this.isScreenSharing = false;
    this.screenStream = null;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });
  }

  toggleVideo() {
    this.isVideoEnabled = !this.isVideoEnabled;
    this.localStream.getVideoTracks().forEach(track => {
      track.enabled = this.isVideoEnabled;
    });
  }

  leaveCall() {
    this.socketService.leaveGroupCall(this.groupId, this.authService.getLoggedInUser()._id);
    // this.cleanUp();
    this.router.navigate(['/chat'], { replaceUrl: true });
  }

  private cleanUp() {
    Object.values(this.peerConnections).forEach(pc => pc.close());
    this.peerConnections = {};

    this.localStream?.getTracks().forEach(track => track.stop());
    this.screenStream?.getTracks().forEach(track => track.stop());

    this.participants = [];
  }


}