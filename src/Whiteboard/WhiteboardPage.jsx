import React, { useEffect, useRef, useState } from "react";
import CursorOverlay from "../CursorOverlay/CursorOverlay";
import { connectWithSocketServer } from "../socketConn/socketConn";
import Whiteboard from "./Whiteboard";
import { useLocation } from "react-router-dom";
import io from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";

// ⚠️ CHANGE THIS to your deployed audio server URL
const AUDIO_SERVER_URL = "http://localhost:5001";

function WhiteboardPage() {
  const location = useLocation();
  const data = location.state;
  console.log(`from min wb page ${JSON.stringify(data)}`);

  // Audio state for mediasoup
  const audioSocketRef = useRef(null);
  const isCreatingTransportRef = useRef(false); // Prevent duplicate transport creation
  const audioProducerRef = useRef(null); // Use ref to avoid stale closure issues
  const consumedProducersRef = useRef(new Set()); // Track already consumed producers
  const [device, setDevice] = useState(null);
  const [producerTransport, setProducerTransport] = useState(null);
  const [consumerTransports, setConsumerTransports] = useState({});
  const [audioProducer, setAudioProducer] = useState(null);
  const [audioConsumers, setAudioConsumers] = useState({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const [usernames, setUsernames] = useState({});
  const [roles, setRoles] = useState({});
  const [isMuted, setIsMuted] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  
  // Recording state (automatic recording when teacher joins)
  const [isRecording, setIsRecording] = useState(false);
  
  // MediaRecorder for client-side recording (teacher only)
  const mediaRecorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const teacherStreamRef = useRef(null);

  // Debug: Expose audioProducer globally for testing
  useEffect(() => {
    if (audioProducer) {
      window.audioProducer = audioProducer;
      console.log('✅ Audio producer is now accessible via window.audioProducer');
      console.log('   Current state - Paused:', audioProducer.paused, 'ID:', audioProducer.id);
    } else {
      window.audioProducer = null;
      console.log('⏳ Audio producer not yet created');
    }
  }, [audioProducer]);

  useEffect(() => {
    connectWithSocketServer(data.roomID, data.userID);
    // eslint-disable-next-line
  }, [data.roomID, data.userID]);

  useEffect(() => {
    const initializeAudio = async () => {
      try {
        console.log('🎤 Initializing mediasoup audio system...');
        
        // 1. Connect to media server
        const socket = io(AUDIO_SERVER_URL, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 2000,
          reconnectionAttempts: 5
        });
        audioSocketRef.current = socket;

        socket.on('connect', () => {
          console.log('✅ Connected to media server:', AUDIO_SERVER_URL);
          console.log('   Socket ID:', socket.id);
        });

        socket.on('connect_error', (error) => {
          console.error('❌ Media server connection error:', error);
          console.error('   Make sure backend is running at:', AUDIO_SERVER_URL);
        });

        socket.on('disconnect', (reason) => {
          console.warn('⚠️ Disconnected from media server. Reason:', reason);
        });

        // Listen for generic errors
        socket.on('error', (error) => {
          console.error('❌ Socket error:', error);
        });

                // Listen for any event errors from server
        socket.onAny((eventName, ...args) => {
          console.log('📨 Event received:', eventName, args);
        });

        // IMPORTANT: Register all event listeners BEFORE joining room or requesting capabilities
        // This ensures we don't miss any events that might be sent immediately

        // 7. Handle new producer (someone started sending audio)
        socket.on('newProducer', async ({ producerId, userId: producerUserId }) => {
          console.log('═══════════════════════════════════════════');
          console.log('🎵 NEW PRODUCER EVENT RECEIVED');
          console.log('   Producer ID:', producerId);
          console.log('   User ID:', producerUserId);
          console.log('   Already consumed?', consumedProducersRef.current.has(producerId));
          console.log('═══════════════════════════════════════════');
          
          // Check if we've already consumed this producer
          if (consumedProducersRef.current.has(producerId)) {
            console.log('⏭️ SKIPPING - Already consuming producer:', producerId);
            return;
          }
          
          const deviceToUse = socket.mediasoupDevice || device;
          if (deviceToUse) {
            console.log('✅ Starting consumption for producer:', producerId);
            // Mark as being consumed
            consumedProducersRef.current.add(producerId);
            await consumeAudio(socket, deviceToUse, producerId, producerUserId);
          } else {
            console.warn('⚠️ Device not ready yet, cannot consume audio from:', producerUserId);
          }
        });

        // Handle mute command from teacher
        socket.on('muteCommand', ({ targetUserId }) => {
          console.log('🔇 Received mute command for:', targetUserId, 'my ID:', data.userID);
          const producer = audioProducerRef.current || window.audioProducer;
          if (targetUserId === data.userID && producer) {
            producer.pause();
            setIsMuted(true);
            console.log('🔇 Muted by teacher - Producer paused');
          } else {
            console.warn('⚠️ Cannot mute - targetUserId:', targetUserId, 'myId:', data.userID, 'producer:', !!producer);
          }
        });

        // Handle unmute command from teacher
        socket.on('unmuteCommand', ({ targetUserId }) => {
          console.log('🔊 Received unmute command for:', targetUserId, 'my ID:', data.userID);
          const producer = audioProducerRef.current || window.audioProducer;
          if (targetUserId === data.userID && producer) {
            producer.resume();
            setIsMuted(false);
            console.log('🔊 Unmuted by teacher - Producer resumed');
          } else {
            console.warn('⚠️ Cannot unmute - targetUserId:', targetUserId, 'myId:', data.userID, 'producer:', !!producer);
          }
        });

        // 2. Get router RTP capabilities
        console.log('📡 Requesting router RTP capabilities...');
        socket.emit('getRouterRtpCapabilities');
        
        // Set a timeout to check if we get capabilities
        const rtpTimeout = setTimeout(() => {
          console.error('⏱️ TIMEOUT: No response for RTP capabilities after 10 seconds');
        }, 10000);
        
        socket.on('routerRtpCapabilities', async (rtpCapabilities) => {
          clearTimeout(rtpTimeout);
          try {
            console.log('📡 Received router RTP capabilities');
            console.log('   Codecs:', rtpCapabilities?.codecs?.length || 0);
            
            // 3. Load mediasoup Device
            const newDevice = new mediasoupClient.Device();
            await newDevice.load({ routerRtpCapabilities: rtpCapabilities });
            setDevice(newDevice);
            console.log('✅ Mediasoup device loaded');
            
            // Store device in socket for later use
            socket.mediasoupDevice = newDevice;
            
            // 4. Join room (AFTER device is loaded and listeners are registered)
            socket.emit('joinRoom', {
              roomId: data.roomID,
              userId: data.userID,
              role: data.role
            });
            console.log('📡 Joining room:', data.roomID);
            
          } catch (error) {
            console.error('❌ Error loading mediasoup device:', error);
          }
        });

        // 5. Handle room joined
        socket.on('roomJoined', async ({ users }) => {
          console.log('✅ Room joined, users:', users);
          
          // Update usernames and roles
          users.forEach(user => {
            setUsernames(prev => ({ ...prev, [user.userId]: user.username || user.userId }));
            setRoles(prev => ({ ...prev, [user.userId]: user.role }));
          });
          
          // Create producer transport for sending audio
          // Use device from socket if state device is not yet available
          const deviceToUse = socket.mediasoupDevice || device;
          if (deviceToUse) {
            console.log('🚀 Creating producer transport with device');
            await createProducerTransport(socket, deviceToUse);
          } else {
            console.error('❌ No device available to create producer transport');
          }
        });

        // 6. Handle new user joined
        socket.on('userJoined', async ({ userId, username, role }) => {
          console.log('👤 New user joined:', userId, username, role);
          setUsernames(prev => ({ ...prev, [userId]: username || userId }));
          setRoles(prev => ({ ...prev, [userId]: role }));
        });

        // 8. Handle user left
        socket.on('userLeft', ({ userId }) => {
          console.log('� User left:', userId);
          
          // Clean up consumer transport
          setConsumerTransports(prev => {
            if (prev[userId]) {
              prev[userId].close();
            }
            const { [userId]: _, ...rest } = prev;
            return rest;
          });
          
          // Clean up audio consumer
          setAudioConsumers(prev => {
            if (prev[userId]) {
              prev[userId].close();
            }
            const { [userId]: _, ...rest } = prev;
            return rest;
          });
          
          // Remove remote stream
          setRemoteStreams(prev => {
            const { [userId]: _, ...rest } = prev;
            return rest;
          });
          
          // Remove username and role
          setUsernames(prev => {
            const { [userId]: _, ...rest } = prev;
            return rest;
          });
          setRoles(prev => {
            const { [userId]: _, ...rest } = prev;
            return rest;
          });
        });

        // Handle producer closed
        socket.on('producerClosed', ({ producerId }) => {
          console.log('🔴 Producer closed:', producerId);
          // Remove from consumed producers tracking
          consumedProducersRef.current.delete(producerId);
        });

        // 9. Recording events
        socket.on('recordingStarted', ({ roomId, filename }) => {
          setIsRecording(true);
          console.log('🔴 Recording started automatically for room:', roomId);
          console.log('   Filename:', filename);
        });

        socket.on('recordingStopped', ({ roomId, duration, fileSize }) => {
          setIsRecording(false);
          console.log('⏹️ Recording stopped. Duration:', duration, 'Size:', fileSize);
        });

        socket.on('classEnded', ({ roomId, teacherId, recording, timestamp }) => {
          console.log('🏁 Class has been ended by teacher');
          if (recording) {
            alert(`Class has ended!\n\nRecording: ${recording.filename}\nDuration: ${Math.floor(recording.duration / 1000)}s`);
          } else {
            alert('Class has ended!');
          }
          // Redirect to home
          setTimeout(() => {
            window.location.href = '/';
          }, 1000);
        });

      } catch (error) {
        console.error('❌ Error initializing audio:', error);
      }
    };

    initializeAudio();

    return () => {
      console.log('🧹 Cleaning up audio connections...');
      
      // Close producer transport
      if (producerTransport) {
        producerTransport.close();
      }
      
      // Close all consumer transports
      Object.values(consumerTransports).forEach(transport => {
        transport.close();
      });
      
      // Close audio producer
      if (audioProducer) {
        audioProducer.close();
      }
      
      // Close all audio consumers
      Object.values(audioConsumers).forEach(consumer => {
        consumer.close();
      });
      
      // Disconnect socket
      if (audioSocketRef.current) {
        audioSocketRef.current.emit('leaveRoom', {
          roomId: data.roomID,
          userId: data.userID
        });
        audioSocketRef.current.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.roomID, data.userID, data.role]);

  // Create producer transport (for sending audio)
  const createProducerTransport = async (socket, mediasoupDevice) => {
    try {
      // Check if already creating or transport already exists
      if (isCreatingTransportRef.current || producerTransport) {
        console.log('⚠️ Producer transport already exists or is being created, skipping');
        return;
      }

      // Set flag to prevent duplicate creation
      isCreatingTransportRef.current = true;

      console.log('🚀 Creating producer transport...');
      console.log('   Room ID:', data.roomID);
      console.log('   User ID:', data.userID);
      console.log('   Device available:', !!mediasoupDevice);
      
      // Request transport creation from server
      socket.emit('createWebRtcTransport', {
        roomId: data.roomID,
        userId: data.userID,
        isProducer: true
      });
      console.log('📡 Emitted createWebRtcTransport event');

      // Set a timeout to check if we receive the response
      const timeout = setTimeout(() => {
        console.error('⏱️ TIMEOUT: No response from server after 10 seconds');
        console.error('   This usually means:');
        console.error('   1. Backend is not running');
        console.error('   2. Backend is not handling "createWebRtcTransport" event');
        console.error('   3. Network connectivity issue');
      }, 10000);

      socket.once('transportCreated', async ({ transport: transportOptions }) => {
        clearTimeout(timeout);
        try {
          console.log('✅ Producer transport created:', transportOptions.id);
          
          // Create send transport
          const transport = mediasoupDevice.createSendTransport(transportOptions);
          setProducerTransport(transport);

          // Handle transport connection
          transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
              socket.emit('connectTransport', {
                transportId: transport.id,
                dtlsParameters
              });
              socket.once('transportConnected', () => {
                console.log('✅ Producer transport connected');
                callback();
              });
            } catch (error) {
              console.error('❌ Error connecting transport:', error);
              errback(error);
            }
          });

          // Handle produce
          transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
            try {
              socket.emit('produce', {
                transportId: transport.id,
                kind,
                rtpParameters,
                roomId: data.roomID,
                userId: data.userID
              });
              socket.once('produced', ({ id }) => {
                console.log('✅ Audio produced with ID:', id);
                callback({ id });
              });
            } catch (error) {
              console.error('❌ Error producing:', error);
              errback(error);
            }
          });

          // Get microphone stream and produce
          console.log('🎤 Requesting microphone access...');
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 8000,
              channelCount: 1
            }
          });
          
          console.log('🎤 Got microphone access, tracks:', stream.getAudioTracks().length);
          const audioTrack = stream.getAudioTracks()[0];
          console.log('🎵 Audio track details:', {
            id: audioTrack.id,
            kind: audioTrack.kind,
            enabled: audioTrack.enabled,
            muted: audioTrack.muted,
            readyState: audioTrack.readyState
          });
          
          // Store stream for teacher (for MediaRecorder)
          teacherStreamRef.current = stream;
          
          // Start MediaRecorder if teacher
          if (data.role === 'teacher') {
            startRecording(stream);
          }
          
          const producer = await transport.produce({ track: audioTrack });
          setAudioProducer(producer);
          audioProducerRef.current = producer; // Store in ref for event handlers
          console.log('✅ Audio producer created successfully!');
          console.log('   Producer ID:', producer.id);
          console.log('   Producer paused:', producer.paused);
          console.log('   Producer track:', producer.track);
          console.log('🎉 You can now test mute/unmute in console: window.audioProducer');
          
          // Reset flag after successful creation
          isCreatingTransportRef.current = false;
          
        } catch (error) {
          console.error('❌ Error setting up producer transport:', error);
          isCreatingTransportRef.current = false; // Reset flag on error
        }
      });
    } catch (error) {
      console.error('❌ Error creating producer transport:', error);
      isCreatingTransportRef.current = false; // Reset flag on error
    }
  };

  // Consume audio from another user
  const consumeAudio = async (socket, mediasoupDevice, producerId, producerUserId) => {
    try {
      console.log('🎧 Consuming audio from producer:', producerId);
      
      // Request consumer transport creation
      socket.emit('createWebRtcTransport', {
        roomId: data.roomID,
        userId: data.userID,
        isProducer: false
      });

      socket.once('consumerTransportCreated', async ({ transport: transportOptions }) => {
        try {
          console.log('✅ Consumer transport created:', transportOptions.id);
          
          // Create receive transport
          const transport = mediasoupDevice.createRecvTransport(transportOptions);
          setConsumerTransports(prev => ({ ...prev, [producerUserId]: transport }));

          // Handle transport connection
          transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
              socket.emit('connectTransport', {
                transportId: transport.id,
                dtlsParameters
              });
              socket.once('transportConnected', () => {
                console.log('✅ Consumer transport connected');
                callback();
              });
            } catch (error) {
              console.error('❌ Error connecting consumer transport:', error);
              errback(error);
            }
          });

          // Request to consume audio
          socket.emit('consume', {
            transportId: transport.id,
            producerId: producerId,
            rtpCapabilities: mediasoupDevice.rtpCapabilities,
            roomId: data.roomID,
            userId: data.userID
          });

          socket.once('consumed', async ({ consumer: consumerOptions }) => {
            try {
              console.log('═══════════════════════════════════════════');
              console.log('✅ CONSUMED EVENT RECEIVED');
              console.log('   Consumer ID:', consumerOptions.id);
              console.log('   Producer User ID:', producerUserId);
              console.log('═══════════════════════════════════════════');
              
              const consumer = await transport.consume(consumerOptions);
              setAudioConsumers(prev => ({ ...prev, [producerUserId]: consumer }));
              
              // Create audio stream and play
              const stream = new MediaStream([consumer.track]);
              setRemoteStreams(prev => ({ ...prev, [producerUserId]: stream }));
              
              console.log('═══════════════════════════════════════════');
              console.log('🔊 AUDIO STREAM CREATED FOR USER:', producerUserId);
              console.log('   Stream ID:', stream.id);
              console.log('   Stream tracks:', stream.getTracks().length);
              console.log('   Track ID:', consumer.track.id);
              console.log('   Track kind:', consumer.track.kind);
              console.log('   Track enabled:', consumer.track.enabled);
              console.log('   Track muted:', consumer.track.muted);
              console.log('   Track readyState:', consumer.track.readyState);
              console.log('   Consumer paused:', consumer.paused);
              console.log('   Stream active:', stream.active);
              console.log('═══════════════════════════════════════════');
              
              // Store in window for debugging
              window.latestConsumer = consumer;
              window.latestStream = stream;
              window[`consumer_${producerUserId}`] = consumer;
              window[`stream_${producerUserId}`] = stream;
              
              // Resume consumer (in case it was paused)
              socket.emit('resumeConsumer', {
                consumerId: consumer.id,
                roomId: data.roomID
              });
              console.log('📡 Emitted resumeConsumer for:', consumer.id);
            } catch (error) {
              console.error('❌ Error consuming audio:', error);
            }
          });
        } catch (error) {
          console.error('❌ Error setting up consumer transport:', error);
        }
      });
    } catch (error) {
      console.error('❌ Error consuming audio:', error);
    }
  };

  // Toggle mute
  const toggleMute = () => {
    const producer = audioProducerRef.current || audioProducer;
    console.log('🎙️ Toggle mute clicked. Current audioProducer:', producer);
    
    if (!producer) {
      console.warn('⚠️ No audio producer available yet. Please wait for audio to initialize.');
      return;
    }
    
    try {
      if (producer.paused) {
        producer.resume();
        setIsMuted(false);
        console.log('🔊 Unmuted - Audio producer resumed');
      } else {
        producer.pause();
        setIsMuted(true);
        console.log('🔇 Muted - Audio producer paused');
      }
    } catch (error) {
      console.error('❌ Error toggling mute:', error);
    }
  };

  // Start MediaRecorder recording (client-side)
  const startRecording = (stream) => {
    try {
      console.log('🎬 Starting MediaRecorder...');
      
      // Check browser support
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 32000 // 32 kbps
      });
      
      mediaRecorderRef.current = mediaRecorder;
      recordingChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
          console.log(`📦 Chunk received: ${(event.data.size / 1024).toFixed(1)} KB`);
        }
      };
      
      mediaRecorder.onstop = async () => {
        console.log('⏹️ MediaRecorder stopped');
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        console.log(`📦 Total recording size: ${(blob.size / 1024).toFixed(1)} KB`);
        
        // Upload to backend
        await uploadRecording(blob);
        
        // Clean up
        recordingChunksRef.current = [];
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder error:', event.error);
      };
      
      // Start recording (collect data every 5 seconds)
      mediaRecorder.start(5000);
      setIsRecording(true);
      console.log('✅ MediaRecorder started');
      console.log('   MIME type:', mimeType);
      console.log('   Bitrate: 32 kbps');
      
    } catch (error) {
      console.error('❌ Error starting MediaRecorder:', error);
    }
  };
  
  // Stop MediaRecorder recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('⏹️ Stopping MediaRecorder...');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };
  
  // Upload recording to backend
  const uploadRecording = async (blob) => {
    try {
      console.log('📤 Uploading recording...');
      
      const formData = new FormData();
      formData.append('recording', blob, `room-${data.roomID}-${new Date().toISOString()}.webm`);
      formData.append('roomId', data.roomID);
      formData.append('userId', data.userID);
      
      const response = await fetch(`${AUDIO_SERVER_URL}/upload-recording`, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Recording uploaded:', result.filename);
        return result;
      } else {
        const error = await response.text();
        console.error('❌ Upload failed:', error);
        throw new Error(error);
      }
    } catch (error) {
      console.error('❌ Error uploading recording:', error);
      throw error;
    }
  };

  // End Class - Stops recording and closes the room
  const handleEndClass = () => {
    if (data.role !== 'teacher') return;
    
    if (!audioSocketRef.current) {
      alert('Audio connection not established. Please refresh the page.');
      return;
    }
    
    const confirmed = window.confirm(
      'Are you sure you want to end the class?\n\nThis will:\n• Stop the recording\n• Close the room\n• Disconnect all participants'
    );
    
    if (!confirmed) return;
    
    console.log('🏁 Ending class...');
    
    // Stop MediaRecorder if running
    stopRecording();
    
    audioSocketRef.current.emit('endClass', { roomId: data.roomID }, (response) => {
      if (response && response.success) {
        console.log('✅ Class ended successfully');
        if (response.recording) {
          alert(`Class ended!\n\nRecording saved: ${response.recording.filename}\nDuration: ${Math.floor(response.recording.duration / 1000)}s`);
        }
        // Redirect to home or dashboard
        window.location.href = '/';
      } else {
        console.error('❌ Error ending class:', response?.error);
        alert('Failed to end class: ' + (response?.error || 'Unknown error'));
      }
    });
  };

  // Mute/Unmute student (teacher only)
  const handleMuteStudent = (userId) => {
    if (data.role !== 'teacher') return;
    if (!audioSocketRef.current) {
      console.warn('Audio socket not connected');
      return;
    }
    audioSocketRef.current.emit('muteStudent', { 
      roomId: data.roomID,
      targetUserId: userId 
    });
  };

  const handleUnmuteStudent = (userId) => {
    if (data.role !== 'teacher') return;
    if (!audioSocketRef.current) {
      console.warn('Audio socket not connected');
      return;
    }
    audioSocketRef.current.emit('unmuteStudent', { 
      roomId: data.roomID,
      targetUserId: userId 
    });
  };

  return (
    <div
      style={{
        width: "10vw",
      }}
    >
      <Whiteboard role={data.role} userID={data.userID} roomID={data.roomID} />
      <CursorOverlay />
      <div
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          zIndex: 1000,
          // This container helps position the two elements on top of each other
          width: "320px",
          height: "450px",
          pointerEvents: "none", // Pass clicks through the container
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "flex-end",
        }}
      >
        {/* Expanded Panel View */}
        <div
          style={{
            width: "320px",
            maxHeight: "450px",
            backgroundColor: "white",
            borderRadius: "12px",
            boxShadow: "0 5px 15px rgba(0,0,0,0.3)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            // The transition magic happens here
            transition: "opacity 300ms ease, transform 300ms ease",
            transformOrigin: "bottom right",
            // Conditionally apply styles for open/closed states
            opacity: isPanelOpen ? 1 : 0,
            transform: isPanelOpen ? "scale(1)" : "scale(0.95)",
            pointerEvents: isPanelOpen ? "auto" : "none",
          }}
        >
          {/* Panel Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 15px",
              borderBottom: "1px solid #e0e0e0",
              backgroundColor: "#f7f7f7",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "16px", color: "#333" }}>
              Participants ({Object.keys(remoteStreams).length + 1})
            </h3>
            <button
              onClick={() => setIsPanelOpen(false)}
              style={{
                background: "none",
                border: "none",
                fontSize: "24px",
                cursor: "pointer",
                lineHeight: 1,
                padding: "0 5px",
                color: "#666",
              }}
            >
              &times;
            </button>
          </div>

          {/* Recording Status - All Users */}
          {isRecording && (
            <div style={{
              padding: '10px 15px',
              borderBottom: '1px solid #f0f0f0',
              backgroundColor: '#fff3cd',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{
                width: '12px',
                height: '12px',
                backgroundColor: '#dc3545',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'pulse 1.5s ease-in-out infinite'
              }}></span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#856404' }}>
                🎙️ Recording in progress...
              </span>
            </div>
          )}

          {/* End Class Button - Teacher Only */}
          {data.role === 'teacher' && (
            <div style={{
              padding: '10px 15px',
              borderBottom: '1px solid #f0f0f0',
              backgroundColor: '#f9f9f9'
            }}>
              <button
                onClick={handleEndClass}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '5px',
                  border: '1px solid #dc3545',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 4px rgba(220, 53, 69, 0.2)'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#c82333';
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = '0 4px 8px rgba(220, 53, 69, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#dc3545';
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 2px 4px rgba(220, 53, 69, 0.2)';
                }}
              >
                🏁 End Class
              </button>
              <p style={{ 
                margin: '8px 0 0 0', 
                fontSize: '11px', 
                color: '#666',
                textAlign: 'center'
              }}>
                Stops recording and closes the room
              </p>
            </div>
          )}



          {/* Participants List */}
          <div style={{ overflowY: "auto", padding: "10px 15px" }}>
            {/* Your Own Controls */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              <p style={{ margin: 0, fontWeight: "bold" }}>
                You ({data.userID})
                {audioProducer && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#5cb85c' }}>🎤</span>}
              </p>
              <button
                onClick={toggleMute}
                disabled={!audioProducer}
                style={{
                  padding: "5px 12px",
                  borderRadius: "5px",
                  border: isMuted ? "1px solid #ccc" : "1px solid #d9534f",
                  backgroundColor: !audioProducer ? '#ddd' : (isMuted ? "#f0f0f0" : "#d9534f"),
                  color: !audioProducer ? '#999' : (isMuted ? "#333" : "white"),
                  cursor: !audioProducer ? 'not-allowed' : "pointer",
                  opacity: !audioProducer ? 0.6 : 1,
                }}
                title={!audioProducer ? 'Waiting for audio to initialize...' : (isMuted ? 'Click to unmute' : 'Click to mute')}
              >
                {isMuted ? "🔇 Unmute" : "🎤 Mute"}
              </button>
            </div>

            {/* Remote Participants */}
            {(() => {
              console.log('🎨 RENDERING REMOTE PARTICIPANTS');
              console.log('   Number of streams:', Object.keys(remoteStreams).length);
              console.log('   Stream IDs:', Object.keys(remoteStreams));
              return null;
            })()}
            {Object.entries(remoteStreams).map(([id, stream]) => (
              <div
                key={id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid #f0f0f0",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    flex: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {usernames[id] || "Unknown"} ({roles[id] || "student"})
                </p>
                <audio
                  autoPlay
                  playsInline
                  ref={(el) => {
                    if (el && el.srcObject !== stream) {
                      console.log(`🔊 Attaching audio element for user ${id}`);
                      console.log('   Stream:', stream);
                      console.log('   Stream tracks:', stream.getTracks());
                      console.log('   Stream active:', stream.active);
                      
                      el.srcObject = stream;
                      el.volume = 1.0;
                      
                      // Explicitly play the audio (handle autoplay policy)
                      el.play()
                        .then(() => {
                          console.log(`✅ Audio playing for user ${id}`);
                        })
                        .catch(err => {
                          console.warn(`⚠️ Audio autoplay prevented for user ${id}:`, err);
                          console.log('👆 User interaction may be required to start audio');
                        });
                    }
                  }}
                  style={{ display: "none" }}
                />
                {data.role === "teacher" && roles[id] === "student" && (
                  <div
                    style={{ display: "flex", gap: "8px", marginLeft: "10px" }}
                  >
                    <button
                      onClick={() => handleMuteStudent(id)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "5px",
                        border: "1px solid #d9534f",
                        backgroundColor: "#d9534f",
                        color: "white",
                        cursor: "pointer",
                      }}
                    >
                      Mute
                    </button>
                    <button
                      onClick={() => handleUnmuteStudent(id)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "5px",
                        border: "1px solid #5cb85c",
                        backgroundColor: "#5cb85c",
                        color: "white",
                        cursor: "pointer",
                      }}
                    >
                      Unmute
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Collapsed "Dot" View */}
        {/* <button
          onClick={() => setIsPanelOpen(true)}
          style={{
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            cursor: "pointer",
            boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
            fontSize: "12px",
            position: "absolute", 
            bottom: 0,
            right: 0,
            transition: "opacity 300ms ease, transform 300ms ease",
            transformOrigin: "bottom right",
            opacity: isPanelOpen ? 0 : 1,
            transform: isPanelOpen ? "scale(0.95)" : "scale(1)",
            pointerEvents: isPanelOpen ? "none" : "auto",
          }}
        >
          <span style={{ fontSize: "18px", fontWeight: "bold" }}>
            {Object.keys(remoteStreams).length + 1}
          </span>
          <span>Users</span>
        </button> */}
      </div>


    </div>
  );
}

export default WhiteboardPage;
