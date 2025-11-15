import { io } from "socket.io-client";
import pako from "pako";
import {
  removeCursorPosition,
  updateCursorPosition,
} from "../CursorOverlay/cursorSlice";
import { setFile } from "../store/fileSlice";
import { setAnswerFromAI } from "../store/questionSlice";
import { store } from "../store/store";
import {
  setElements,
  setMessages,
  setQuizAnswer,
  setPollData,
  updateElement,
  removeElement,
  toggleTheme, // Add theme toggle import
} from "../Whiteboard/whiteboardSlice";
import { resetSharingState, setSharedWebsite } from "../store/websiteSlice";

let socket;

function dataURLtoBlob(dataurl) {
  const parts = dataurl.split(",");
  const mime = parts[0].match(/:(.*?);/)[1];
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export const connectWithSocketServer = (roomID, userID) => {
  socket = io("", {
    transports: ['websocket', 'polling'],
    timeout: 20000,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });
  console.log(`room ID from connect to socket : : ${roomID} : : ${userID}`);

  socket.on("connect", () => {
    console.log("Successfully connected to socket.io server");
    if (roomID && userID) {
      socket.emit("join-room", { userID, roomID });
    }
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error);
  });

  socket.on("disconnect", (reason) => {
    console.warn("Socket disconnected:", reason);
  });

  socket.on("reconnect", (attemptNumber) => {
    console.log("Socket reconnected after", attemptNumber, "attempts");
  });

  socket.on("reconnect_error", (error) => {
    console.error("Socket reconnection failed:", error);
  });

  socket.on("whiteboard-state", (data) => {
    const { elements } = data;
    store.dispatch(setElements(elements));
  });

  socket.on("user-disconnected", ({ userID: disconnectedUserId }) => {
    console.log(`User with ID ${disconnectedUserId} has disconnected.`);
    store.dispatch(removeCursorPosition(disconnectedUserId));
  });

  socket.on("element-update", (elementData) => {
    console.log("Client received element:", elementData.type, elementData.id);
    if (elementData.type === "image") {
      console.log(
        "Received image:",
        elementData.src,
        elementData.width,
        elementData.height
      );
    }
    store.dispatch(updateElement(elementData));
  });

  // Add this new socket listener for element removal
  socket.on("element-removal", ({ elementId }) => {
    console.log(`Received element removal for ID: ${elementId}`);
    store.dispatch(removeElement(elementId));
  });

  socket.on("whiteboard-clear", () => {
    setTimeout(() => {
      store.dispatch(setElements([]));
    }, 500);
  });

  // Theme synchronization now handled via message system above



  socket.on("cursor-position", (cursorData) => {
    setTimeout(() => {
      store.dispatch(updateCursorPosition(cursorData));
    }, 500);
  });

  socket.on("message", (data) => {
    try {
      // Extract the compressed message from the data object
      const compressedMessage = data.compressedMessage || data;
      
      // Decompress
      const binaryString = atob(compressedMessage);
      const charCodes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        charCodes[i] = binaryString.charCodeAt(i);
      }
      const decompressed = pako.inflate(charCodes, { to: "string" });
      const { userID, roomID, messageCopy } = JSON.parse(decompressed);
      // message unused in current implementation

      // Check if any message is a theme change command
      const hasThemeChange = messageCopy.some(msg => {
        try {
          if (typeof msg.text === 'string') {
            const parsed = JSON.parse(msg.text);
            if (parsed.type === 'THEME_CHANGE') {
              console.log("Theme change received via message system:", parsed.isDarkTheme ? "blackboard" : "whiteboard");
              console.log("From user:", parsed.from);
              
              const currentState = store.getState().whiteboard;
              if (currentState.isDarkTheme !== parsed.isDarkTheme) {
                console.log("Applying theme change via message system");
                store.dispatch(toggleTheme());
              }
              return true;
            }
          }
        } catch (e) {
          // Not a JSON message, continue normal processing
        }
        return false;
      });

      // Only process as regular messages if no theme change was found
      if (!hasThemeChange) {
        // Ensure all messages in messageCopy have proper structure
        const updatedMessages = messageCopy.map(msg => {
          const userId = msg.user || msg.userID || userID;
          return {
            id: msg.id || Date.now().toString() + Math.random(),
            text: msg.text || msg.message,
            user: userId,
            userID: userId,
            role: msg.role || (userId === 'teacher' ? 'teacher' : 'student'),
            timestamp: msg.timestamp || new Date().toISOString(),
            roomID: msg.roomID || roomID
          };
        });

        // Update the messages state with the properly formatted message copy
        store.dispatch(setMessages(updatedMessages));
      }
    } catch (err) {
      console.error("Decompression failed:", err);
      console.error("Received data:", data);
    }
  });

  socket.on("quiz", (pollData) => {
    // Store the complete poll data in Redux
    store.dispatch(setPollData(pollData));
    
    // Also set quizAnswer for backward compatibility
    if (pollData.correctAnswer) {
      store.dispatch(setQuizAnswer(pollData.correctAnswer));
    }
  });

  // Local testing: Listen for localStorage changes (cross-tab communication)
  window.addEventListener('storage', (e) => {
    if (e.key === 'currentPollData' && e.newValue) {
      try {
        const pollData = JSON.parse(e.newValue);
        store.dispatch(setPollData(pollData));
        if (pollData.correctAnswer) {
          store.dispatch(setQuizAnswer(pollData.correctAnswer));
        }
      } catch (error) {
        console.error("Error parsing cross-tab poll data:", error);
      }
    }
  });

  socket.on("got-definition", (result) => {
    console.log(result);
    store.dispatch(setAnswerFromAI(result));
  });

  socket.on("file-media", (compressedFileData) => {
    console.log("Received compressed media file");
    try {
      const decompressed = pako.inflate(compressedFileData, { to: "string" });
      const { fileName, fileType, fileData } = JSON.parse(decompressed);

      console.log("Decompressed file:", fileName, fileType);
      store.dispatch(setFile(fileData)); // Set the data URL directly
    } catch (error) {
      console.error("Error processing compressed file:", error);
    }
  });

  socket.on("file-url", ({ fileName, fileType, fileData }) => {
    console.log("Received URL/Text file:", fileName, fileType);
    store.dispatch(setFile(fileData));
  });

  socket.on("file-other", (compressedFileData) => {
    console.log("Received other compressed file");
    try {
      const decompressed = pako.inflate(compressedFileData, { to: "string" });
      const { fileData } = JSON.parse(decompressed);
      // fileName and fileType unused in current implementation  
      store.dispatch(setFile(fileData));
    } catch (error) {
      console.error("Error processing other file:", error);
    }
  });

  // ✅ Update existing listener
  socket.on("file-rechieved", ({ fileName, fileType, fileData }) => {
    console.log("Received file via file-received:", fileName, fileType);
    store.dispatch(setFile(fileData));
  });

  socket.on("website-shared", ({ websiteUrl, userID }) => {
    console.log(`Received website URL: ${websiteUrl} from user: ${userID}`);
    store.dispatch(setSharedWebsite({ websiteUrl, sharedBy: userID }));
  });

  socket.on("website-closed", ({ userID, roomID }) => {
    console.log(`Website sharing closed by user: ${userID} in room: ${roomID}`);
    store.dispatch(resetSharingState());
  });


};

export const emitElementUpdate = (elementData, roomID) => {
  console.log(`\n\n\n\nElement DAta : \n\n ${JSON.stringify(elementData)}`);
  // Ensure all properties are preserved, especially for images
  const completeElementData = {
    ...elementData,
    // Explicitly preserve image source and dimensions if it exists
    ...(elementData.type === "image" && {
      src: elementData.src,
      width: elementData.width,
      height: elementData.height,
    }),
  };

  console.log("Emitting element update:", completeElementData);
  socket.emit("element-update", { elementData: completeElementData, roomID });
};

export const emitImageElement = (imageElementData, roomID) => {
  console.log("Emitting image element:", imageElementData);
  const completeImageData = {
    ...imageElementData,
    type: "image",
    src: imageElementData.src,
    width:
      imageElementData.width ||
      Math.abs(imageElementData.x2 - imageElementData.x1) ||
      200,
    height:
      imageElementData.height ||
      Math.abs(imageElementData.y2 - imageElementData.y1) ||
      200,
    x1: imageElementData.x1,
    y1: imageElementData.y1,
    x2: imageElementData.x2,
    y2: imageElementData.y2,
    id: imageElementData.id,
  };

  // Use element-update to maintain consistency
  socket.emit("element-update", {
    elementData: completeImageData,
    roomID,
  });
};

// In your socketConn.js file
export const emitElementRemoval = (elementId, roomID) => {
  console.log(
    `Emitting element removal for ID: ${elementId} in room: ${roomID}`
  );

  socket.emit("element-removal", { elementId, roomID });
};

export const emitClearWhiteboard = (roomID) => {
  socket.emit("whiteboard-clear", roomID);
};

export const emitCursorPosition = ({ cursorData, roomID }) => {
  socket.emit("cursor-position", { cursorData, roomID });
};

export const emitMessages = ({ userID, message, roomID, messageCopy }) => {
  const jsonString = JSON.stringify({ userID, message, roomID, messageCopy });
  const compressed = pako.deflate(jsonString);
  socket.emit("message", {
    roomID: roomID,
    compressedMessage: btoa(String.fromCharCode(...compressed)),
  });
};

export const quiz = (pollData) => {
  socket.emit("quiz", pollData);
  
  // For local testing: store in localStorage to share between tabs
  localStorage.setItem('currentPollData', JSON.stringify(pollData));
  
  // Dispatch to current tab
  store.dispatch(setPollData(pollData));
  if (pollData.correctAnswer) {
    store.dispatch(setQuizAnswer(pollData.correctAnswer));
  }
  
  // Trigger storage event for other tabs
  window.dispatchEvent(new StorageEvent('storage', {
    key: 'currentPollData',
    newValue: JSON.stringify(pollData)
  }));
};

export const emitQuestion = ({ userID, question }) => {
  console.log("emit question trigerred !!", userID);
  socket.emit("get-definition", { userID, question });
};

export const emitFile = ({ roomID, fileName, fileType, fileData }) => {
  const data = fileData || fileName;
  const blob =
    typeof data === "string"
      ? dataURLtoBlob(data)
      : new Blob([data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  console.log("Generated blob URL:", url);
  store.dispatch(setFile(url));
  socket.emit("file", { roomID, fileName, fileType, fileData });
};

export const emitWebsiteShare = ({ websiteUrl, roomID, userID }) => {
  try {
    new URL(websiteUrl);
    socket.emit("share-website", { websiteUrl, roomID, userID });
    console.log(`Sharing website: ${websiteUrl} in room: ${roomID}`);
  } catch (error) {
    console.error("Invalid URL format:", error);
  }
};

export const emitWebsiteClosed = ({ roomID, userID }) => {
  socket.emit("website-closed", { roomID, userID });
  console.log(`Closing website sharing in room: ${roomID}`);
};

// Theme synchronization - teacher emits theme changes to students using existing message system
export const emitThemeChange = ({ roomID, isDarkTheme, userID }) => {
  console.log("🎨 Teacher emitting theme change:");
  console.log("  Room:", roomID);
  console.log("  Theme:", isDarkTheme ? 'blackboard' : 'whiteboard');
  console.log("  Teacher ID:", userID);
  
  // Use the existing message system to send theme changes
  const themeMessage = {
    id: Date.now().toString() + Math.random(),
    text: JSON.stringify({
      type: 'THEME_CHANGE',
      isDarkTheme: isDarkTheme,
      from: userID,
      timestamp: Date.now()
    }),
    user: userID,
    userID: userID,
    role: 'teacher',
    timestamp: new Date().toISOString(),
    roomID: roomID
  };
  
  emitMessages({ 
    userID, 
    message: themeMessage.text, 
    roomID, 
    messageCopy: [themeMessage] // messageCopy should be an array
  });
  
  console.log(`✅ Theme change emitted via message system`);
};

// Utility functions to check socket status
export const isSocketConnected = () => {
  return socket && socket.connected;
};

export const getSocketId = () => {
  return socket ? socket.id : null;
};

export const reconnectSocket = () => {
  if (socket && !socket.connected) {
    socket.connect();
  }
};
