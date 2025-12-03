import { Injectable } from '@angular/core';
import { Socket } from 'ngx-socket-io';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';
import { AlertService } from 'src/app/_shared/alert/alert.service';
@Injectable({
  providedIn: 'root'
})
export class SocketService {
  constructor(
    private socket: Socket,
    private http: HttpClient,
    private authService: AuthService,
    private alertService: AlertService,

  ) {
    this.autoReconnect();
  }

  connectWithToken() {
    const token = this.authService.getToken();
    if (!token) {
      this.alertService.error('No token found for WebSocket connection');
      return;
    }

    this.socket.disconnect();
    this.socket.io.opts.query = { token };
    this.socket.connect();
  }
  autoReconnect() {
    const token = this.authService.getToken();
    if (token) {
      this.connectWithToken();
    }
  }

  joinConversation(conversationId: string): void {
    this.socket.emit('joinConversation', conversationId);
  }

  uploadFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return this.http.post<{ fileUrl: string }>(`${environment.apiUrl}/upload`, formData);
  }

  sendMessage(messageData: { user: string, conversationId: string, content: string, fileUrl?: string, type: string }) {
    this.socket.emit('sendMessage', messageData);
  }

  typing(conversationId: string, userId: string): void {
    this.socket.emit('typing', conversationId, userId);

    setTimeout(() => {
      this.socket.emit('stopTyping', conversationId, userId);
    }, 2000);
  }

  receivedTyping() {
    return this.socket.fromEvent('userTyping');
  }

  newMessageReceived() {
    return this.socket.fromEvent('receiveMessage');
  }
  messagesMarkedRead() {
    return this.socket.fromEvent("messagesMarkedRead");
  }

  markMessagesAsRead(conversationId: string) {
    const userId = this.authService.getLoggedInUser()._id;
    this.socket.emit("markMessagesRead", conversationId, userId);
  }

  disconnectSocket() {
    this.socket.disconnect();
  }

  callUser(userToCall: string, signalData: any, from: string, callType: 'audio' | 'video') {
    this.socket.emit("callUser", { userToCall, signalData, from, callType });
  }

  answerCall(to: string, signal: any) {
    this.socket.emit("answerCall", { to, signal });
  }

  onIncomingCall() {
    return this.socket.fromEvent("incomingCall");
  }

  onCallAccepted() {
    return this.socket.fromEvent("callAccepted");
  }

  sendIceCandidate(userToCall: string, candidate: any) {
    this.socket.emit("iceCandidate", { userToCall, candidate });
  }

  onIceCandidate() {
    return this.socket.fromEvent("iceCandidate");
  }
  endCall(receiverId: string) {
    this.socket.emit('call-ended', { to: receiverId });
  }

  onCallEnded() {
    return this.socket.fromEvent("callEnded");
  }

  joinGroup(conversationId: string): void {
    this.socket.emit('joinConversation', conversationId);
  }

  sendGroupMessage(messageData: { user: string, conversationId: string, content: string, fileUrl?: string, type: string }) {
    this.socket.emit('sendMessage', messageData);
  }

  newGroupMessageReceived() {
    return this.socket.fromEvent('receiveMessage');
  }

  startGroupCall(groupId: string, userId: string) {
    this.socket.emit('startGroupCall', { groupId, userId });
  }

  joinGroupCall(groupId: string, userId: string) {
    this.socket.emit('joinGroupCall', { groupId, userId });
  }

  leaveGroupCall(groupId: string, userId: string) {
    this.socket.emit('leaveGroupCall', { groupId, userId });
  }

  onGroupCallStarted() {
    return this.socket.fromEvent('groupCallStarted');
  }

  onGroupCallEnded() {
    return this.socket.fromEvent('groupCallEnded');
  }

  onGroupCallParticipantJoined() {
    return this.socket.fromEvent('groupCallParticipantJoined');
  }

  onGroupCallParticipantLeft() {
    return this.socket.fromEvent('groupCallParticipantLeft');
  }

  onGroupCallOffer() {
    return this.socket.fromEvent('groupCallOffer');
  }

  onGroupCallAnswer() {
    return this.socket.fromEvent('groupCallAnswer');
  }

  onGroupCallIceCandidate() {
    return this.socket.fromEvent('groupCallIceCandidate');
  }

  sendGroupCallAnswer(groupId: string, toUserId: string, answer: any) {
    this.socket.emit('groupCallAnswer', { groupId, toUserId, answer });
  }

  sendGroupCallIceCandidate(groupId: string, toUserId: string, candidate: any) {
    this.socket.emit('groupCallIceCandidate', { groupId, toUserId, candidate });
  }

  sendGroupCallOffer(groupId: string, toUserId: string, offer: any) {
    this.socket.emit('groupCallOffer', { groupId, toUserId, offer });
  }

}
