import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AlertService } from 'src/app/_shared/alert/alert.service';
import { IUser } from 'src/app/core/interfaces/user';
import { UserService } from 'src/app/core/services/user.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {

  @Input() userId!: string;
  user!: IUser;
  isLoading: Boolean = false;

  constructor(
    private userService: UserService,
    private alertService: AlertService,
    public activeModal: NgbActiveModal
  ) { }

  ngOnInit(): void {
    this.getUserData(this.userId);
  }

  getUserData(userId: string) {
    this.isLoading = true;
    this.userService.getUserById(userId).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.user = response.data;
      },
      error: (error) => {
        this.isLoading = false;
        this.alertService.error(`Failed to fetch user details: ${error || 'Unknown error'}`);
      }
    });
  }

  closeModal() {
    this.activeModal.close();
  }
}
