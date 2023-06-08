// DOM elements.
const roomSelectionContainer = document.getElementById(
  'room-selection-container',
);
const roomInput = document.getElementById('room-input');
const connectButton = document.getElementById('connect-button');

const videoChatContainer = document.getElementById('video-chat-container');
const localVideoComponent = document.getElementById('local-video');
const remoteVideoComponent = document.getElementById('remote-video');

// Variables.
const socket = io('ws://localhost:4000');
const mediaConstraints = {
  audio: true,
  video: { width: 1280, height: 720 },
};
let localStream;
let remoteStream;
let isRoomCreator;
let rtcPeerConnection; // Connection between the local device and the remote peer.
let roomId;

// Free public STUN servers provided by Google.
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

// BUTTON LISTENER ============================================================
connectButton.addEventListener('click', () => {
  joinRoom(roomInput.value);
});

// SOCKET EVENT CALLBACKS =====================================================
socket.on('room_created', async () => {
  console.log('Socket event callback: room_created');

  await setLocalStream(mediaConstraints);
});

socket.on('new_peer_created', async ({ roomId, peerTo, newPeerId }) => {
  console.log('Socket event callback: room_joined', newPeerId);

  await setLocalStream(mediaConstraints);

  rtcPeerConnection = new RTCPeerConnection(iceServers);

  addLocalTracks(rtcPeerConnection);

  rtcPeerConnection.ontrack = setRemoteStream;

  rtcPeerConnection.onicecandidate = (e) => {
    sendIceCandidate(e, peerTo, newPeerId);
  };

  await createOffer(rtcPeerConnection, { roomId, peerTo, newPeerId });
});

socket.on('setup_local_stream', async () => {
  console.log('Socket event callback: setup_local_stream');

  await setLocalStream(mediaConstraints);
});

socket.on('new_webrtc_offer', async ({ roomId, peerFrom, peerTo, sdp }) => {
  console.log('Socket event callback: new_webrtc_offer');

  rtcPeerConnection = new RTCPeerConnection(iceServers);
  addLocalTracks(rtcPeerConnection);
  rtcPeerConnection.ontrack = setRemoteStream;
  rtcPeerConnection.onicecandidate = (e) => {
    sendIceCandidate(e, peerTo, peerFrom);
  };
  rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
  await createAnswer(rtcPeerConnection, {
    roomId,
    peerFrom: peerTo,
    peerTo: peerFrom,
  });
});

// last stage
socket.on('webrtc_answer_to_the_offer', (event) => {
  console.log('Socket event callback: webrtc_answer_to_the_offer');

  rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event.sdp));

  socket.emit('webrtc_signalling_completion', {
    roomId: event.roomId,
    label: event.label,
    peerFrom: event.peerTo,
    peerTo: event.peerFrom,
  });
});

socket.on('webrtc_ice_candidate', (event) => {
  console.log('Socket event callback: webrtc_ice_candidate');

  // ICE candidate configuration.
  var candidate = new RTCIceCandidate({
    sdpMLineIndex: event.label,
    candidate: event.candidate,
  });
  rtcPeerConnection.addIceCandidate(candidate);
});

// FUNCTIONS ==================================================================
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

function addLocalTracks(rtcPeerConnection) {
  localStream.getTracks().forEach((track) => {
    rtcPeerConnection.addTrack(track, localStream);
  });
}

async function createOffer(rtcPeerConnection, { roomId, peerTo, newPeerId }) {
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
    peerFrom: peerTo,
    peerTo: newPeerId,
  });
}

async function createAnswer(rtcPeerConnection, { roomId, peerFrom, peerTo }) {
  let sessionDescription;
  try {
    sessionDescription = await rtcPeerConnection.createAnswer();
    rtcPeerConnection.setLocalDescription(sessionDescription);
  } catch (error) {
    console.error(error);
  }

  socket.emit('webrtc_answer_to_the_offer', {
    type: 'webrtc_answer',
    sdp: sessionDescription,
    roomId,
    peerFrom,
    peerTo,
  });
}

function setRemoteStream(event) {
  remoteVideoComponent.srcObject = event.streams[0];
  remoteStream = event.stream;
}

function sendIceCandidate(event, peerFrom, peerTo) {
  if (event.candidate) {
    socket.emit('webrtc_ice_candidate', {
      roomId,
      label: event.candidate.sdpMLineIndex,
      candidate: event.candidate.candidate,
      peerFrom,
      peerTo,
    });
  }
}
