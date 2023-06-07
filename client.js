const roomSelectionContainer = document.getElementById(
  'room-selection-container',
);
const roomInput = document.getElementById('room-input');
const connectButton = document.getElementById('connect-button');

const videoChatContainer = document.getElementById('video-chat-container');
const localVideoComponent = document.getElementById('local-video');
const remoteVideoComponent = document.getElementById('remote-video');

const socket = io('ws://localhost:4000');
const mediaConstraints = {
  audio: true,
  video: { width: 1280, height: 720 },
};
let localStream;
let remoteStream;
let isRoomCreator;
let rtcPeerConnection;
let roomId;

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

connectButton.addEventListener('click', () => {
  joinRoom(roomInput.value);
});

function joinRoom(room) {
  if (room === '') {
    alert('Please type a room ID');
  } else {
    roomId = room;
    socket.emit('join', room);
    showVideoConference();
  }
}

function showVideoConference() {
  roomSelectionContainer.style = 'display: none';
  videoChatContainer.style = 'display: block';
}

socket.on('room_created', async () => {
  await setLocalStream(mediaConstraints);
  isRoomCreator = true;
});

socket.on('joined', async (data) => {
  if (!isRoomCreator) {
    await setLocalStream(mediaConstraints);
    socket.emit('start_call', data.roomId);
  }
});

// Works at peer-1
socket.on('start_call', async () => {
  if (isRoomCreator) {
    rtcPeerConnection = new RTCPeerConnection(iceServers);
    addLocalTracks(rtcPeerConnection);
    rtcPeerConnection.ontrack = setRemoteStream;
    rtcPeerConnection.onicecandidate = sendIceCandidate;
    await createOffer(rtcPeerConnection);
  }
});

// Works at peer-2
socket.on('webrtc_offer', async (event) => {
  if (!isRoomCreator) {
    rtcPeerConnection = new RTCPeerConnection(iceServers);
    addLocalTracks(rtcPeerConnection);
    rtcPeerConnection.ontrack = setRemoteStream;
    rtcPeerConnection.onicecandidate = sendIceCandidate;
    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event));
    await createAnswer(rtcPeerConnection);
  }
});

socket.on('webrtc_answer', (event) => {
  if (isRoomCreator) {
    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event));
  }
});

socket.on('webrtc_ice_candidate', (event) => {
  const candidate = new RTCIceCandidate({
    sdpMLineIndex: event.label,
    candidate: event.candidate,
  });

  rtcPeerConnection.addIceCandidate(candidate);
});

function addLocalTracks(rtcPeerConnection) {
  localStream.getTracks().forEach((track) => {
    rtcPeerConnection.addTrack(track, localStream);
  });
}

async function createOffer(rtcPeerConnection) {
  let sessionDescription;

  try {
    sessionDescription = await rtcPeerConnection.createOffer();
    rtcPeerConnection.setLocalDescription(sessionDescription);
  } catch (error) {
    console.error(error);
  }

  socket.emit('webrtc_offer', {
    type: 'webrtc_offer',
    sdp: sessionDescription,
    roomId,
  });
}

async function createAnswer(rtcPeerConnection) {
  let sessionDescription;
  try {
    sessionDescription = await rtcPeerConnection.createAnswer();
    rtcPeerConnection.setLocalDescription(sessionDescription);
  } catch (error) {
    console.error(error);
  }

  socket.emit('webrtc_answer', {
    type: 'webrtc_answer',
    sdp: sessionDescription,
    roomId,
  });
}

function sendIceCandidate(event) {
  if (event.candidate) {
    socket.emit('webrtc_ice_candidate', {
      roomId,
      label: event.candidate.sdpMLineIndex,
      candidate: event.candidate.candidate,
    });
  }
}

async function setLocalStream(mediaConstraints) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
  } catch (error) {
    console.error('Could not get user media', error);
  }

  localStream = stream;
  localVideoComponent.srcObject = stream;
}

function setRemoteStream(event) {
  remoteVideoComponent.srcObject = event.streams[0];
  remoteStream = event.stream;
}
