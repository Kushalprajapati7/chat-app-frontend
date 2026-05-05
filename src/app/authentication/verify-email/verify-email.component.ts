import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-verify-email',
  templateUrl: './verify-email.component.html',
  styleUrls: ['./verify-email.component.scss']
})
export class VerifyEmailComponent implements OnInit {
  isVerifying = true;
  success = false;
  message = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    
    if (!token) {
      this.isVerifying = false;
      this.message = 'Invalid or missing verification token.';
      return;
    }

    this.authService.verifyEmail(token).subscribe({
      next: (res) => {
        this.isVerifying = false;
        this.success = true;
        this.message = res.message || 'Email verified successfully!';
        setTimeout(() => this.router.navigate(['/auth/login']), 3000);
      },
      error: (err) => {
        this.isVerifying = false;
        this.success = false;
        this.message = err.error?.message || err.message || 'Verification failed. The token may be expired.';
      }
    });
  }

  goToLogin() {
    this.router.navigate(['/auth/login']);
  }
}
