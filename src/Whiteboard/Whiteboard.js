import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import rough from "roughjs/bundled/rough.esm";
import { v4 as uuid } from "uuid";
import { Redo2, Undo2 } from "lucide-react";
// Enhanced Components
import TopToolbar from "../components/TopToolbar";
import ChatSidebar from "../components/ChatSidebar";
import ImageModal from "../components/ImageModal";
import PollModal from "../components/PollModal";
import ShapeDropdown from "../components/ShapeDropdown";

// Existing Components
import CursorOverlay from "../CursorOverlay/CursorOverlay";
import AiSearchPopup from "../components/AiSearchPopup";
import PdfViewer from "../components/PdfViewer";
import Menu from "./Menu";
import WebsiteShareControl from "../components/WebsiteShareControl";

// Styles and Constants
import { actions, cursorPositions, toolTypes } from "../constants";

import pdfImage from "../resources/icons/icons8-pdf-50.png";

// Socket and Store
import {
  emitCursorPosition,
  emitFile,
  emitImageElement,
  emitMessages,
  quiz,
} from "../socketConn/socketConn";
import { clearFile } from "../store/fileSlice";
import { store } from "../store/store";

// Utils
import {
  adjustElementCoordinates,
  adjustmentRequired,
  createElement,
  drawElement,
  getCursorForPosition,
  getElementAtPosition,
  getResizedCoordinates,
  updateElement,
  updatePencilElementWhenMoving,
} from "./utils";
import {
  setMessages,
  setElements,
  updateElement as updateElementInStore,
  setToolType,
} from "./whiteboardSlice";
import { setFillMode, setFillStyle } from "../store/fillShape";

let emitCursor = true;
let lastCursorPosition;

const Whiteboard = ({ role, userID, roomID }) => {
  const canvasRef = useRef();
  const textAreaRef = useRef();
  
  // Initialize global erased elements tracking for Redux integration
  useEffect(() => {
    if (!window.erasedElementsSet) {
      window.erasedElementsSet = new Set();
      window.eraseTimeoutMap = new Map();
    }
  }, []);
  
  // Enhanced state management  
  const [moveCanvas] = useState("");
  const [AISearchOpen, setAISearchOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [openImageModal, setOpenImageModal] = useState(false);
  const [openPollModal, setOpenPollModal] = useState(false);
  const [pollManuallyClosed, setPollManuallyClosed] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [action, setAction] = useState(null);
  const [selectedElement, setSelectedElement] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  

  const [resultPoll, setResultPoll] = useState("");
  
  // Eraser state management
  const [eraserSize, setEraserSize] = useState(30);
  const [showEraserDropdown, setShowEraserDropdown] = useState(false);
  const [eraserDropdownPosition, setEraserDropdownPosition] = useState({ x: 0, y: 0 });
  
  // Pencil state management
  const [pencilSize, setPencilSize] = useState(3);
  const [showPencilDropdown, setShowPencilDropdown] = useState(false);
  const [pencilDropdownPosition, setPencilDropdownPosition] = useState({ x: 0, y: 0 });
  
  // Fill dropdown state management
  const [showFillDropdown, setShowFillDropdown] = useState(false);
  const [fillDropdownPosition, setFillDropdownPosition] = useState({ x: 0, y: 0 });
  
  // Shape dropdown state management
  const [showShapeDropdown, setShowShapeDropdown] = useState(false);
  const [shapeDropdownPosition, setShapeDropdownPosition] = useState({ x: 0, y: 0 });
  
  // Touch/Mouse conflict prevention
  const [lastTouchTime, setLastTouchTime] = useState(0);

  // Undo/Redo state management
  const [history, setHistory] = useState([[]]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(0);

  // Redux state
  const dispatch = useDispatch();
  const file = useSelector((state) => state.file.file);
  const toolType = useSelector((state) => state.whiteboard.tool);
  const selectedColor = useSelector((state) => state.whiteboard.selectedColor);
  const elements = useSelector((state) => state.whiteboard.elements);
  const messages = useSelector((state) => state.whiteboard.messages);
  const pollData = useSelector((state) => state.whiteboard.pollData);
  const fillShape = useSelector((state) => state.fillShape.filling);
  const fillStylee = useSelector((state) => state.fillShape.fillStyle);
  const websiteUrl = useSelector((state) => state.website.websiteUrl);
  const isDarkTheme = useSelector((state) => state.whiteboard.isDarkTheme);
  
  const [openImageModel, setOpenImageModel] = useState();
  const [imageUrl, setImageUrl] = useState();
  const [pdfUrl, setPdfUrl] = useState(null);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  
  // Set pencil as default tool for teachers
  useEffect(() => {
    if (role === "teacher" && !toolType) {
      dispatch(setToolType(toolTypes.PENCIL));
    }
  }, [role, toolType, dispatch]);
  
      // Auto-open poll modal for students when poll data is received
  useEffect(() => {
    if (role === 'student' && pollData && !openPollModal && !pollManuallyClosed) {
      setOpenPollModal(true);
      // Reset manually closed flag when new poll arrives
      setPollManuallyClosed(false);
    }
  }, [pollData, role, openPollModal, pollManuallyClosed]);
  
  // Set cursor emit permissions
  if (role === "teacher") {
    emitCursor = true;
  } else {
    emitCursor = false;
  }

  // Removed old poll variables - using PollModal system only


  console.log(`\n\n${fillStylee}\n\n`);

  // Select audio-related state from Redux
  // eslint-disable-next-line


  useEffect(() => {
    if (websiteUrl) {
      window.open(websiteUrl, "_blank");
    }
  }, [websiteUrl]);



  useEffect(() => {
    console.log("Elements array updated:", {
      count: elements.length,
      elementIds: elements.map((el) => ({ id: el.id, type: el.type })),
    });
  }, [elements]);





  useEffect(() => {
    if (!file) {
      return;
    }

    let isPDF = true;
    let fileData = null;
    let fileName = null;

    // Handle different file formats
    if (typeof file === "string") {
      fileData = file;
      // isPDF = file.includes("application/pdf");
      console.log("String format file, isPDF:", isPDF);
    } else if (file && typeof file === "object") {
      fileData = file.file || file.url;
      fileName = file.fileName;
      isPDF =
        file.fileType === "application/pdf" ||
        (fileName && fileName.toLowerCase().endsWith(".pdf")) ||
        (fileData && fileData.includes("application/pdf"));
      console.log("Object format file, isPDF:", isPDF, "fileName:", fileName);
    }

    if (isPDF) {
      console.log("✅ PDF detected - setting up for viewing");
      setPdfUrl(fileData);
      // For students, don't auto-open, show button instead
      if (role === 'student') {
        setShowPdfViewer(true);
      } else {
        setShowPdf(true);
      }
      return;
    }

    if (fileData && !isPDF) {
      console.log("Non-PDF file - downloading");
      const link = document.createElement("a");
      link.href = fileData;
      link.download = fileName || "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        dispatch(clearFile());
      }, 1000);
    }
  }, [file, dispatch, setShowPdf, role]);

  useEffect(() => {
    // Reset drawing state when tool changes
    setAction(null);
    setSelectedElement(null);
  }, [toolType]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Apply theme-based background
    if (isDarkTheme) {
      // Blackboard mode - dark background
      ctx.fillStyle = "#1f2937"; // Dark gray background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      // Whiteboard mode - light background
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const roughCanvas = rough.canvas(canvas);

    console.log("Rendering elements:", elements.length);

    elements.forEach((element) => {
      drawElement({ roughCanvas, context: ctx, element });
    });
  }, [elements, isDarkTheme]);

  useEffect(() => {
    const handleImageLoaded = () => {
      // Force re-render when images load
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        
        // Apply theme-based background
        if (isDarkTheme) {
          ctx.fillStyle = "#1f2937";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        const roughCanvas = rough.canvas(canvas);
        elements.forEach((element) => {
          drawElement({ roughCanvas, context: ctx, element });
        });
      }
    };

    const handleImageError = () => {
      // Force re-render when images fail to load
      handleImageLoaded();
    };

    window.addEventListener("imageLoaded", handleImageLoaded);
    window.addEventListener("imageError", handleImageError);

    return () => {
      window.removeEventListener("imageLoaded", handleImageLoaded);
      window.removeEventListener("imageError", handleImageError);
    };
  }, [elements, isDarkTheme]);



  // Simple eraser: works like pencil but with background color
  const startErasing = (x, y) => {
    // Get background color based on theme (match the canvas background exactly)
    const backgroundColor = isDarkTheme ? '#1f2937' : '#ffffff';
    
    // Create eraser element (pencil with background color)
    const eraserElement = {
      id: uuid(),
      x1: x,
      y1: y,
      x2: x,
      y2: y,
      type: toolTypes.PENCIL,
      points: [{ x, y }],
      color: backgroundColor,
      strokeWidth: eraserSize, // Use eraser size as stroke width
    };
    
    // Add to elements and set as selected
    const updatedElements = [...elements, eraserElement];
    dispatch(setElements(updatedElements));
    setSelectedElement(eraserElement);
    setAction(actions.DRAWING);
  };


  
  // Custom cursor icons
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (toolType === toolTypes.ERASER) {
      // Create black and white eraser icon cursor
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 12L7 17L17 7L12 2Z" fill="#ffffff" stroke="#000000" stroke-width="1.5"/>
          <path d="M7 17L12 22L22 12L17 7" fill="#f3f4f6" stroke="#000000" stroke-width="1.5"/>
        </svg>
      `;
      const encodedSvg = encodeURIComponent(svg);
      canvas.style.cursor = `url('data:image/svg+xml;utf8,${encodedSvg}') 12 12, auto`;
    } else if (toolType === toolTypes.PENCIL) {
      // Create black and white pencil icon cursor
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M3 21L12 12L21 3L18 0L9 9L0 18Z" fill="#ffffff" stroke="#000000" stroke-width="1.5"/>
          <path d="M15 6L18 9" stroke="#000000" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="19" cy="5" r="2" fill="#fbbf24" stroke="#000000" stroke-width="1"/>
        </svg>
      `;
      const encodedSvg = encodeURIComponent(svg);
      canvas.style.cursor = `url('data:image/svg+xml;utf8,${encodedSvg}') 2 22, auto`;
    } else {
      canvas.style.cursor = 'default';
    }
  }, [toolType]);
  
  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = () => {
      setShowEraserDropdown(false);
      setShowPencilDropdown(false);
      setShowFillDropdown(false);
      setShowShapeDropdown(false);
    };

    if (showEraserDropdown || showPencilDropdown || showFillDropdown || showShapeDropdown) {
      // Add a small delay to prevent immediate closure when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [showEraserDropdown, showPencilDropdown, showFillDropdown, showShapeDropdown]);

  // Handle eraser dropdown opening from toolbar
  const handleEraserDropdown = (position) => {
    setEraserDropdownPosition(position);
    setShowEraserDropdown(true);
  };
  
  // Handle pencil dropdown opening from toolbar
  const handlePencilDropdown = (position) => {
    setPencilDropdownPosition(position);
    setShowPencilDropdown(true);
    // Close other dropdowns
    setShowEraserDropdown(false);
    setShowFillDropdown(false);
    setShowShapeDropdown(false);
  };
  
  // Handle fill dropdown opening from toolbar
  const handleFillDropdown = (position) => {
    setFillDropdownPosition(position);
    setShowFillDropdown(true);
    // Close other dropdowns
    setShowEraserDropdown(false);
    setShowPencilDropdown(false);
    setShowShapeDropdown(false);
  };
  
  // Handle shape dropdown opening from toolbar
  const handleShapeDropdown = (position) => {
    setShapeDropdownPosition(position);
    setShowShapeDropdown(true);
    // Close other dropdowns
    setShowEraserDropdown(false);
    setShowPencilDropdown(false);
    setShowFillDropdown(false);
  };


  
  // Clear erased element tracking when whiteboard is cleared
  useEffect(() => {
    if (elements.length === 0 && window.erasedElementsSet) {
      // Clear all timeouts
      window.eraseTimeoutMap.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      window.eraseTimeoutMap.clear();
      window.erasedElementsSet.clear();
      console.log('Cleared all erased element tracking due to whiteboard clear');
    }
  }, [elements.length]);
  
  // Cleanup effect for eraser timeouts
  useEffect(() => {
    return () => {
      // Clear all timeouts on unmount
      if (window.eraseTimeoutMap) {
        window.eraseTimeoutMap.forEach((timeoutId) => {
          clearTimeout(timeoutId);
        });
        window.eraseTimeoutMap.clear();
      }
      if (window.erasedElementsSet) {
        window.erasedElementsSet.clear();
      }
    };
  }, []);

  // Undo/Redo functionality
  const saveState = useCallback(() => {
    // Create a deep copy of current elements
    const currentState = JSON.parse(JSON.stringify(elements));
    
    // Remove any future history if we're in the middle of history
    const newHistory = history.slice(0, currentHistoryIndex + 1);
    
    // Add new state to history
    newHistory.push(currentState);
    
    // Limit history to last 50 states to prevent memory issues
    if (newHistory.length > 50) {
      newHistory.shift();
    } else {
      setCurrentHistoryIndex(currentHistoryIndex + 1);
    }
    
    setHistory(newHistory);
  }, [elements, history, currentHistoryIndex]);

  const undo = useCallback(() => {
    if (currentHistoryIndex > 0) {
      const newIndex = currentHistoryIndex - 1;
      setCurrentHistoryIndex(newIndex);
      dispatch(setElements(history[newIndex]));
    }
  }, [currentHistoryIndex, history, dispatch]);

  const redo = useCallback(() => {
    if (currentHistoryIndex < history.length - 1) {
      const newIndex = currentHistoryIndex + 1;
      setCurrentHistoryIndex(newIndex);
      dispatch(setElements(history[newIndex]));
    }
  }, [currentHistoryIndex, history, dispatch]);

  // Initialize history with first empty state
  useEffect(() => {
    if (history.length === 1 && history[0].length === 0 && elements.length === 0) {
      // History is already initialized with empty state
      return;
    }
    
    // If elements changed externally (like from socket), update history
    if (elements.length === 0 && history[currentHistoryIndex]?.length > 0) {
      // Elements were cleared, save this state
      saveState();
    }
  }, [elements.length, history, currentHistoryIndex, saveState]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (role !== "teacher") return; // Only teachers can undo/redo
      
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        redo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [role, undo, redo]);

  // Update your handleMouseDown function
  const handleMouseDown = (event) => {
    // Prevent mouse events if recent touch activity (within 500ms)
    if (Date.now() - lastTouchTime < 500) {
      return;
    }

    const { clientX, clientY } = event;
    const adjustedY = clientY;

    if (selectedElement && action === actions.WRITING) {
      return;
    }

    console.log(`${fillStylee}`);

    switch (toolType) {
      case toolTypes.RECTANGLE:
      case toolTypes.LINE:
      case toolTypes.PENCIL:
      case toolTypes.CIRCLE:
      case toolTypes.TRIANGLE:
      case toolTypes.DIAMOND:
      case toolTypes.STAR:
      case toolTypes.ARROW:
      case toolTypes.PENTAGON:
      case toolTypes.HEXAGON:
      case toolTypes.HEART:
      case toolTypes.CLOUD: {
        const element = createElement({
          x1: clientX,
          y1: adjustedY,
          x2: clientX,
          y2: adjustedY,
          toolType,
          id: uuid(),
          color: selectedColor,
          fill: fillShape,
          fillColorStyle: fillStylee,
          strokeW: toolType === toolTypes.PENCIL ? pencilSize : 2,
        });

        setAction(actions.DRAWING);
        setSelectedElement(element);
        dispatch(updateElementInStore(element));
        break;
      }

      case toolTypes.TEXT: {
        const element = createElement({
          x1: clientX,
          y1: clientY,
          x2: clientX,
          y2: clientY,
          toolType,
          id: uuid(),
          color: selectedColor,
        });

        setAction(actions.WRITING);
        setSelectedElement(element);
        dispatch(updateElementInStore(element));
        break;
      }

      case toolTypes.IMAGE: {
        setOpenImageModel(true);
        setMousePosition({ x: clientX, y: clientY });
        break;
      }

      case toolTypes.ERASER: {
        // Start erasing (drawing with background color)
        startErasing(clientX, adjustedY);
        break;
      }

      case toolTypes.SELECTION: {
        const element = getElementAtPosition(clientX, clientY, elements);

        if (
          element &&
          (element.type === toolTypes.RECTANGLE ||
            element.type === toolTypes.TEXT ||
            element.type === toolTypes.LINE ||
            element.type === toolTypes.IMAGE ||
            element.type === toolTypes.TRIANGLE ||
            element.type === toolTypes.CIRCLE ||
            element.type === toolTypes.DIAMOND ||
            element.type === toolTypes.STAR ||
            element.type === toolTypes.ARROW ||
            element.type === toolTypes.PENTAGON ||
            element.type === toolTypes.HEXAGON ||
            element.type === toolTypes.HEART ||
            element.type === toolTypes.CLOUD)
        ) {
          // Determine if we're resizing or moving based on cursor position
          setAction(
            element.position === cursorPositions.INSIDE
              ? actions.MOVING
              : actions.RESIZING
          );

          // console.log(
          //   `\n\nLINE 428 IN WHITEBOAARD: \n\n ${JSON.stringify(element)}`
          // );

          const offsetX = clientX - element.x1;
          const offsetY = clientY - element.y1;

          setSelectedElement({ ...element, offsetX, offsetY });
        }

        if (element && element.type === toolTypes.PENCIL) {
          setAction(actions.MOVING);

          const xOffsets = element.points.map((point) => clientX - point.x);
          const yOffsets = element.points.map((point) => clientY - point.y);

          setSelectedElement({ ...element, xOffsets, yOffsets });
        }
        break;
      }

      default:
        return;
    }
  };

  // Update your handleMouseMove function
  const handleMouseMove = (event) => {
    // Prevent mouse events if recent touch activity (within 500ms)
    if (Date.now() - lastTouchTime < 500) {
      return;
    }

    const { clientX, clientY } = event;

    lastCursorPosition = {
      cursorData: { x: clientX, y: clientY },
      roomID: roomID,
    };

    if (emitCursor) {
      emitCursorPosition({
        cursorData: { x: clientX, y: clientY },
        roomID: roomID,
      });

      setTimeout(() => {
        emitCursor = true;
        emitCursorPosition(lastCursorPosition);
      }, [80]);
    }

    // Handle eraser drawing (like pencil but with background color)
    if (toolType === toolTypes.ERASER && action === actions.DRAWING && selectedElement) {
      // Update eraser stroke just like pencil
      const newPoints = [...selectedElement.points, { x: clientX, y: clientY }];
      const elementsCopy = [...elements];
      const index = elementsCopy.findIndex(el => el.id === selectedElement.id);
      
      if (index !== -1) {
        elementsCopy[index] = {
          ...selectedElement,
          points: newPoints,
        };
        dispatch(setElements(elementsCopy));
        setSelectedElement({ ...selectedElement, points: newPoints });
      }
    }

    // Handle drawing new elements
    if (action === actions.DRAWING && selectedElement) {
      const index = elements.findIndex((el) => el.id === selectedElement.id);

      if (index !== -1) {
        const elementColor =
          elements[index].color ||
          selectedElement.color ||
          store.getState().whiteboard.selectedColor ||
          "#000000";

        console.log(`\n\nELEMENTS ARRRRAUS ${JSON.stringify(elements)}`);

        updateElement(
          {
            index,
            id: elements[index].id,
            x1: elements[index].x1,
            y1: elements[index].y1,
            x2: clientX,
            y2: clientY,
            type: elements[index].type,
            color: elementColor,
            fill: fillShape,
            fillStyle: fillStylee,
          },
          elements,
          roomID
        );
      }
    }

    // Handle selection tool cursor changes
    if (toolType === toolTypes.SELECTION) {
      const element = getElementAtPosition(clientX, clientY, elements);
      event.target.style.cursor = element
        ? getCursorForPosition(element.position)
        : "default";
    }

    // Handle moving elements

    if (
      toolType === toolTypes.SELECTION &&
      action === actions.MOVING &&
      selectedElement
    ) {
      // Handle pencil movement
      if (selectedElement.type === toolTypes.PENCIL) {
        const newPoints = selectedElement.points.map((_, index) => ({
          x: clientX - selectedElement.xOffsets[index],
          y: clientY - selectedElement.yOffsets[index],
        }));

        const index = elements.findIndex((el) => el.id === selectedElement.id);
        if (index !== -1) {
          updatePencilElementWhenMoving(
            {
              index,
              newPoints,
              color: selectedElement.color,
            },
            elements,
            roomID // ✅ Pass roomID here
          );
        }
        return;
      }

      // Handle other element types movement
      const { id, x1, x2, y1, y2, src, type, offsetX, offsetY, text, color } =
        selectedElement;
      console.log(
        `\n\nSELECTED ELEMENT DHASV: \n\n ${JSON.stringify(
          selectedElement
        )}\n\n`
      );

      const width = x2 - x1;
      const height = y2 - y1;

      const newX1 = clientX - offsetX;
      const newY1 = clientY - offsetY;

      const index = elements.findIndex((el) => el.id === selectedElement.id);

      if (index !== -1) {
        updateElement(
          {
            id,
            x1: newX1,
            y1: newY1,
            x2: newX1 + width,
            y2: newY1 + height,
            type,
            index,
            src: src,
            text,
            color,
          },
          elements,
          roomID
        );
      }
    }

    // Handle resizing elements
    if (
      toolType === toolTypes.SELECTION &&
      action === actions.RESIZING &&
      selectedElement
    ) {
      console.log(`\n\n\ndsadsaadsada ${JSON.stringify(selectedElement)} \n\n`);
      const { id, type, position, src, color, ...coordinates } =
        selectedElement;
      // console.log(`\n\n\ndsadsaadsada ${src} \n\n`);

      const { x1, y1, x2, y2 } = getResizedCoordinates(
        clientX,
        clientY,
        position,
        coordinates
      );

      const selectedElementIndex = elements.findIndex(
        (el) => el.id === selectedElement.id
      );

      if (selectedElementIndex !== -1) {
        updateElement(
          {
            x1,
            x2,
            y1,
            y2,
            src,
            type: selectedElement.type,
            id: selectedElement.id,
            index: selectedElementIndex,
            color: selectedElement.color,
          },
          elements,
          roomID
        );
      }
    }
  };

  const handleMouseUp = () => {
    // Prevent mouse events if recent touch activity (within 500ms)
    if (Date.now() - lastTouchTime < 500) {
      return;
    }

    console.log(
      "Mouse up called, action:",
      action,
      "selectedElement:",
      selectedElement?.id
    );

    if (!selectedElement) {
      setAction(null);
      return;
    }

    const selectedElementIndex = elements.findIndex(
      (el) => el.id === selectedElement?.id
    );

    if (selectedElementIndex !== -1) {
      if (action === actions.DRAWING || action === actions.RESIZING) {
        console.log("Element type:", elements[selectedElementIndex].type);

        if (adjustmentRequired(elements[selectedElementIndex].type)) {
          const { x1, y1, x2, y2 } = adjustElementCoordinates(
            elements[selectedElementIndex]
          );

          const currentColor = elements[selectedElementIndex].color;

          console.log("Adjusting element coordinates:", {
            x1,
            y1,
            x2,
            y2,
            color: currentColor,
          });

          updateElement(
            {
              id: selectedElement.id,
              index: selectedElementIndex,
              x1,
              x2,
              y1,
              y2,
              type: elements[selectedElementIndex].type,
              color: currentColor,
              fill: fillShape,
              fillStyle: fillStylee,
            },
            elements,
            roomID
          );
        }
      }
    }

    // Save state for undo/redo after completing drawing operation
    if (selectedElement) {
      setTimeout(() => saveState(), 100); // Small delay to ensure state is updated
    }

    // CRITICAL: Always reset these states to prevent sticky behavior
    setAction(null);
    setSelectedElement(null);
  };

  // Touch event handlers for mobile devices
  const handleTouchStart = (event) => {
    event.preventDefault(); // Prevent scrolling/zooming
    if (event.touches.length !== 1) return; // Only handle single touch
    
    // Set timestamp to prevent mouse event conflicts
    setLastTouchTime(Date.now());
    
    const touch = event.touches[0];
    const mouseEvent = {
      clientX: touch.clientX,
      clientY: touch.clientY,
    };
    
    // Call the original mouse handler logic directly (bypassing timestamp check)
    const { clientX, clientY } = mouseEvent;
    const adjustedY = clientY;

    if (selectedElement && action === actions.WRITING) {
      return;
    }

    console.log(`${fillStylee}`);

    switch (toolType) {
      case toolTypes.RECTANGLE:
      case toolTypes.LINE:
      case toolTypes.PENCIL:
      case toolTypes.CIRCLE:
      case toolTypes.TRIANGLE:
      case toolTypes.DIAMOND:
      case toolTypes.STAR:
      case toolTypes.ARROW:
      case toolTypes.PENTAGON:
      case toolTypes.HEXAGON:
      case toolTypes.HEART:
      case toolTypes.CLOUD: {
        const element = createElement({
          x1: clientX,
          y1: adjustedY,
          x2: clientX,
          y2: adjustedY,
          toolType,
          id: uuid(),
          color: selectedColor,
          fill: fillShape,
          fillColorStyle: fillStylee,
          strokeW: toolType === toolTypes.PENCIL ? pencilSize : 2,
        });

        setAction(actions.DRAWING);
        setSelectedElement(element);
        dispatch(updateElementInStore(element));
        break;
      }

      case toolTypes.TEXT: {
        const element = createElement({
          x1: clientX,
          y1: clientY,
          x2: clientX,
          y2: clientY,
          toolType,
          id: uuid(),
          color: selectedColor,
        });

        setAction(actions.WRITING);
        setSelectedElement(element);
        dispatch(updateElementInStore(element));
        break;
      }

      case toolTypes.IMAGE: {
        setOpenImageModel(true);
        setMousePosition({ x: clientX, y: clientY });
        break;
      }

      case toolTypes.ERASER: {
        // Start erasing (drawing with background color)
        startErasing(clientX, adjustedY);
        break;
      }

      case toolTypes.SELECTION: {
        const element = getElementAtPosition(clientX, clientY, elements);

        if (
          element &&
          (element.type === toolTypes.RECTANGLE ||
            element.type === toolTypes.TEXT ||
            element.type === toolTypes.LINE ||
            element.type === toolTypes.IMAGE ||
            element.type === toolTypes.TRIANGLE ||
            element.type === toolTypes.CIRCLE ||
            element.type === toolTypes.DIAMOND ||
            element.type === toolTypes.STAR ||
            element.type === toolTypes.ARROW ||
            element.type === toolTypes.PENTAGON ||
            element.type === toolTypes.HEXAGON ||
            element.type === toolTypes.HEART ||
            element.type === toolTypes.CLOUD)
        ) {
          // Determine if we're resizing or moving based on cursor position
          setAction(
            element.position === cursorPositions.INSIDE
              ? actions.MOVING
              : actions.RESIZING
          );

          const offsetX = clientX - element.x1;
          const offsetY = clientY - element.y1;

          setSelectedElement({ ...element, offsetX, offsetY });
        }

        if (element && element.type === toolTypes.PENCIL) {
          setAction(actions.MOVING);

          const xOffsets = element.points.map((point) => clientX - point.x);
          const yOffsets = element.points.map((point) => clientY - point.y);

          setSelectedElement({ ...element, xOffsets, yOffsets });
        }
        break;
      }

      default:
        return;
    }
  };

  const handleTouchMove = (event) => {
    event.preventDefault(); // Prevent scrolling/zooming
    if (event.touches.length !== 1) return; // Only handle single touch
    
    // Update touch timestamp
    setLastTouchTime(Date.now());
    
    const touch = event.touches[0];
    const { clientX, clientY } = touch;

    // Handle touch move logic directly (bypassing timestamp check)
    lastCursorPosition = {
      cursorData: { x: clientX, y: clientY },
      roomID: roomID,
    };

    if (emitCursor) {
      emitCursorPosition({
        cursorData: { x: clientX, y: clientY },
        roomID: roomID,
      });

      setTimeout(() => {
        emitCursor = true;
        emitCursorPosition(lastCursorPosition);
      }, [80]);
    }

    // Handle eraser drawing (like pencil but with background color)
    if (toolType === toolTypes.ERASER && action === actions.DRAWING && selectedElement) {
      // Update eraser stroke just like pencil
      const newPoints = [...selectedElement.points, { x: clientX, y: clientY }];
      const elementsCopy = [...elements];
      const index = elementsCopy.findIndex(el => el.id === selectedElement.id);
      
      if (index !== -1) {
        elementsCopy[index] = {
          ...selectedElement,
          points: newPoints,
        };
        dispatch(setElements(elementsCopy));
        setSelectedElement({ ...selectedElement, points: newPoints });
      }
    }

    // Handle drawing new elements
    if (action === actions.DRAWING && selectedElement) {
      const index = elements.findIndex((el) => el.id === selectedElement.id);

      if (index !== -1) {
        const elementColor =
          elements[index].color ||
          selectedElement.color ||
          store.getState().whiteboard.selectedColor ||
          "#000000";

        updateElement(
          {
            index,
            id: elements[index].id,
            x1: elements[index].x1,
            y1: elements[index].y1,
            x2: clientX,
            y2: clientY,
            type: elements[index].type,
            color: elementColor,
            fill: fillShape,
            fillStyle: fillStylee,
          },
          elements,
          roomID
        );
      }
    }

    // Handle selection tool cursor changes
    if (toolType === toolTypes.SELECTION) {
      // Note: Can't set cursor style on touch devices, so skipping element position check
    }

    // Handle moving elements
    if (
      toolType === toolTypes.SELECTION &&
      action === actions.MOVING &&
      selectedElement
    ) {
      // Handle pencil movement
      if (selectedElement.type === toolTypes.PENCIL) {
        const newPoints = selectedElement.points.map((_, index) => ({
          x: clientX - selectedElement.xOffsets[index],
          y: clientY - selectedElement.yOffsets[index],
        }));

        const index = elements.findIndex((el) => el.id === selectedElement.id);
        if (index !== -1) {
          updatePencilElementWhenMoving(
            {
              index,
              newPoints,
              color: selectedElement.color,
            },
            elements,
            roomID
          );
        }
        return;
      }

      // Handle other element types movement
      const { id, x1, x2, y1, y2, src, type, offsetX, offsetY, text, color } =
        selectedElement;

      const width = x2 - x1;
      const height = y2 - y1;

      const newX1 = clientX - offsetX;
      const newY1 = clientY - offsetY;

      const index = elements.findIndex((el) => el.id === selectedElement.id);

      if (index !== -1) {
        updateElement(
          {
            id,
            x1: newX1,
            y1: newY1,
            x2: newX1 + width,
            y2: newY1 + height,
            type,
            index,
            src: src,
            text,
            color,
          },
          elements,
          roomID
        );
      }
    }

    // Handle resizing elements
    if (
      toolType === toolTypes.SELECTION &&
      action === actions.RESIZING &&
      selectedElement
    ) {
      const { id, type, position, src, color, ...coordinates } =
        selectedElement;

      const { x1, y1, x2, y2 } = getResizedCoordinates(
        clientX,
        clientY,
        position,
        coordinates
      );

      const selectedElementIndex = elements.findIndex(
        (el) => el.id === selectedElement.id
      );

      if (selectedElementIndex !== -1) {
        updateElement(
          {
            x1,
            x2,
            y1,
            y2,
            src,
            type: selectedElement.type,
            id: selectedElement.id,
            index: selectedElementIndex,
            color: selectedElement.color,
          },
          elements,
          roomID
        );
      }
    }
  };

  const handleTouchEnd = (event) => {
    event.preventDefault(); // Prevent scrolling/zooming
    
    // Update touch timestamp
    setLastTouchTime(Date.now());
    
    // Handle touch end logic directly (bypassing timestamp check)
    console.log(
      "Touch end called, action:",
      action,
      "selectedElement:",
      selectedElement?.id
    );

    if (!selectedElement) {
      setAction(null);
      return;
    }

    const selectedElementIndex = elements.findIndex(
      (el) => el.id === selectedElement?.id
    );

    if (selectedElementIndex !== -1) {
      if (action === actions.DRAWING || action === actions.RESIZING) {
        console.log("Element type:", elements[selectedElementIndex].type);

        if (adjustmentRequired(elements[selectedElementIndex].type)) {
          const { x1, y1, x2, y2 } = adjustElementCoordinates(
            elements[selectedElementIndex]
          );

          const currentColor = elements[selectedElementIndex].color;

          console.log("Adjusting element coordinates:", {
            x1,
            y1,
            x2,
            y2,
            color: currentColor,
          });

          updateElement(
            {
              id: selectedElement.id,
              index: selectedElementIndex,
              x1,
              x2,
              y1,
              y2,
              type: elements[selectedElementIndex].type,
              color: currentColor,
              fill: fillShape,
              fillStyle: fillStylee,
            },
            elements,
            roomID
          );
        }
      }
    }

    // Save state for undo/redo after completing touch drawing operation
    if (selectedElement) {
      setTimeout(() => saveState(), 100); // Small delay to ensure state is updated
    }

    // CRITICAL: Always reset these states to prevent sticky behavior
    setAction(null);
    setSelectedElement(null);
  };

  const handleTextareaBlur = (event) => {
    const { id, x1, y1, type } = selectedElement;

    const index = elements.findIndex((el) => el.id === selectedElement.id);

    if (index !== -1) {
      updateElement(
        { id, x1, y1, type, text: event.target.value, index },
        elements,
        roomID
      );

      setAction(null);
      setSelectedElement(null);
    }
  };



  // Removed old poll system - now using PollModal only

  // In your Whiteboard.js handleFileChange function, add logging:
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    console.log("=== FILE UPLOAD DEBUG ===");
    console.log("Selected file:", file.name, file.type, file.size);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (evt) => {
      console.log("FileReader result length:", evt.target.result.length);
      console.log(
        "FileReader result preview:",
        evt.target.result.substring(0, 100)
      );

      emitFile({
        roomID,
        fileName: file.name,
        fileType: file.type,
        fileData: evt.target.result,
      });
    };
  };

  // const handleAddImage = () => {
  //   if (!imageUrl) return;

  //   try {
  //     new URL(imageUrl);
  //   } catch {
  //     alert("Please enter a valid URL");
  //     return;
  //   }

  //   const width = 200;
  //   const height = 200;

  //   const element = createElement({
  //     x1: mousePosition.x,
  //     y1: mousePosition.y,
  //     x2: mousePosition.x + width,
  //     y2: mousePosition.y + height,
  //     toolType: toolTypes.IMAGE,
  //     id: uuid(),
  //     src: imageUrl,
  //     color: selectedColor,
  //   });

  //   // Ensure dimensions are set
  //   element.width = width;
  //   element.height = height;

  //   // Update local state
  //   setSelectedElement(element);
  //   dispatch(updateElementInStore(element));

  //   // Emit to other users
  //   emitImageElement(element, roomID);

  //   // Close modal
  //   setOpenImageModel(false);
  //   setImageUrl("");

  //   console.log("Image element created and emitted:", element);
  // };

  const handleAddImage = () => {
    if (!imageUrl) return;

    try {
      new URL(imageUrl); // validate
    } catch {
      alert("Please enter a valid URL");
      return;
    }

    const img = new Image();
    img.src = imageUrl;

    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;

      const element = createElement({
        x1: mousePosition.x,
        y1: mousePosition.y,
        x2: mousePosition.x + width,
        y2: mousePosition.y + height,
        toolType: toolTypes.IMAGE,
        id: uuid(),
        src: imageUrl,
        color: selectedColor,
      });

      // Set correct dimensions
      element.width = width;
      element.height = height;

      // Update local state
      setSelectedElement(element);
      dispatch(updateElementInStore(element));

      // Emit to other users
      emitImageElement(element, roomID);

      // Close modal
      setOpenImageModel(false);
      setImageUrl("");

      console.log("Image element created and emitted:", element);
    };

    img.onerror = () => {
      alert("Failed to load image. Please check the URL.");
    };
  };

  return (
    <div>
      {/* Top Toolbar for enhanced navigation */}
      <TopToolbar 
        role={role} 
        userID={userID}
        roomID={roomID}
        onChatToggle={() => setIsChatOpen(!isChatOpen)}
        isChatOpen={isChatOpen}
        onAISearchOpen={() => setAISearchOpen(true)}
        onPollOpen={() => setOpenPollModal(true)}
      />

      {/* Undo/Redo Controls - Upper Right */}
      {role === "teacher" && (
        <div
          style={{
            position: "fixed",
            top: "80px",
            right: "20px",
            zIndex: 1000,
            display: "flex",
            gap: "8px",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            borderRadius: "12px",
            padding: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
            backdropFilter: "blur(10px)",
          }}
        >
          <button
            onClick={undo}
            disabled={currentHistoryIndex <= 0}
            style={{
              width: "40px",
              height: "40px",
              border: "none",
              borderRadius: "8px",
              backgroundColor: currentHistoryIndex <= 0 ? "#f3f4f6" : "#6366f1",
              color: currentHistoryIndex <= 0 ? "#9ca3af" : "#ffffff",
              cursor: currentHistoryIndex <= 0 ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              fontWeight: "bold",
              transition: "all 0.2s ease",
              boxShadow: currentHistoryIndex <= 0 ? "none" : "0 2px 4px rgba(99, 102, 241, 0.2)",
            }}
            onMouseEnter={(e) => {
              if (currentHistoryIndex > 0) {
                e.target.style.backgroundColor = "#4f46e5";
                e.target.style.transform = "scale(1.05)";
              }
            }}
            onMouseLeave={(e) => {
              if (currentHistoryIndex > 0) {
                e.target.style.backgroundColor = "#6366f1";
                e.target.style.transform = "scale(1)";
              }
            }}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 />
          </button>

          <button
            onClick={redo}
            disabled={currentHistoryIndex >= history.length - 1}
            style={{
              width: "40px",
              height: "40px",
              border: "none",
              borderRadius: "8px",
              backgroundColor: currentHistoryIndex >= history.length - 1 ? "#f3f4f6" : "#6366f1",
              color: currentHistoryIndex >= history.length - 1 ? "#9ca3af" : "#ffffff",
              cursor: currentHistoryIndex >= history.length - 1 ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              fontWeight: "bold",
              transition: "all 0.2s ease",
              boxShadow: currentHistoryIndex >= history.length - 1 ? "none" : "0 2px 4px rgba(99, 102, 241, 0.2)",
            }}
            onMouseEnter={(e) => {
              if (currentHistoryIndex < history.length - 1) {
                e.target.style.backgroundColor = "#4f46e5";
                e.target.style.transform = "scale(1.05)";
              }
            }}
            onMouseLeave={(e) => {
              if (currentHistoryIndex < history.length - 1) {
                e.target.style.backgroundColor = "#6366f1";
                e.target.style.transform = "scale(1)";
              }
            }}
            title="Redo (Ctrl+Y)"
          >
            <Redo2/>
          </button>
        </div>
      )}

      {role === "teacher" && (
        <>
          <Menu 
            roomID={roomID}
            onEraserClick={handleEraserDropdown}
            onPencilClick={handlePencilDropdown}
            onFillClick={handleFillDropdown}
            onShapeClick={handleShapeDropdown}
          />
          {action === actions.WRITING ? (
            <textarea
              ref={textAreaRef}
              onBlur={handleTextareaBlur}
              style={{
                position: "absolute",
                top: selectedElement.y1 - 3,
                left: selectedElement.x1,
                font: "12px sans-serif",
                margin: 0,
                padding: 0,
                border: 0,
                outline: 0,
                resize: "auto",
                overflow: "visible",
                whiteSpace: "pre",
                background: "transparent",
              }}
            />
          ) : null}
        </>
      )}

      {openImageModel && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
            border: "1px solid #e5e7eb",
            zIndex: 1000,
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <input
            type="text"
            placeholder="Enter image URL"
            value={imageUrl || ""}
            onChange={(e) => setImageUrl(e.target.value)}
            style={{
              width: "300px",
              padding: "12px",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              fontSize: "14px",
              outline: "none",
              transition: "border-color 0.2s ease",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
            onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}
            onKeyPress={(e) => {
              if (e.key === "Enter" && imageUrl) {
                handleAddImage();
              }
            }}
          />
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={handleAddImage}
              disabled={!imageUrl}
              style={{
                padding: "10px 16px",
                backgroundColor: imageUrl ? "#3b82f6" : "#d1d5db",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: imageUrl ? "pointer" : "not-allowed",
                transition: "all 0.2s ease",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              }}
              onMouseOver={(e) => {
                if (imageUrl) e.target.style.backgroundColor = "#2563eb";
              }}
              onMouseOut={(e) => {
                if (imageUrl) e.target.style.backgroundColor = "#3b82f6";
              }}
            >
              Add Image
            </button>
            <button
              onClick={() => {
                setOpenImageModel(false);
                setImageUrl("");
              }}
              style={{
                padding: "10px 16px",
                backgroundColor: "#ef4444",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              }}
              onMouseOver={(e) => (e.target.style.backgroundColor = "#dc2626")}
              onMouseOut={(e) => (e.target.style.backgroundColor = "#ef4444")}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {role === "student" && <CursorOverlay />}

      {/* Eraser Size Dropdown */}
      {showEraserDropdown && toolType === toolTypes.ERASER && (
        <div
          style={{
            position: "fixed",
            left: `${Math.min(eraserDropdownPosition.x, window.innerWidth - 220)}px`,
            top: `${Math.min(eraserDropdownPosition.y, window.innerHeight - 300)}px`,
            backgroundColor: "rgba(31, 41, 55, 0.95)",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
            border: "1px solid #4b5563",
            backdropFilter: "blur(10px)",
            zIndex: 2000,
            padding: "16px",
            minWidth: "200px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px"
          }}>
            <div style={{
              width: "24px",
              height: "24px",
              backgroundColor: "#4b5563",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #6b7280"
            }}>
              <span style={{ color: "#e5e7eb", fontSize: "14px" }}>✏️</span>
            </div>
            <span style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "#e5e7eb"
            }}>Eraser Size</span>
          </div>
          
          <div style={{ marginBottom: "16px" }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px"
            }}>
              <span style={{ fontSize: "14px", color: "#9ca3af" }}>Size: {eraserSize}px</span>
              <div style={{
                width: `${Math.min(eraserSize, 32)}px`,
                height: `${Math.min(eraserSize, 32)}px`,
                backgroundColor: "#6b7280",
                borderRadius: "50%",
                border: "2px solid #9ca3af",
                opacity: 0.8
              }} />
            </div>
            <input
              type="range"
              min="10"
              max="80"
              value={eraserSize}
              onChange={(e) => setEraserSize(parseInt(e.target.value))}
              style={{
                width: "100%",
                height: "6px",
                borderRadius: "3px",
                background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${((eraserSize - 10) / 70) * 100}%, #374151 ${((eraserSize - 10) / 70) * 100}%, #374151 100%)`,
                outline: "none",
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none"
              }}
            />
          </div>
          
          <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
            {[15, 25, 35, 50, 65].map(size => (
              <button
                key={size}
                onClick={() => {
                  setEraserSize(size);
                }}
                style={{
                  flex: 1,
                  padding: "6px 4px",
                  border: eraserSize === size ? "2px solid #6366f1" : "1px solid #4b5563",
                  borderRadius: "6px",
                  backgroundColor: eraserSize === size ? "#6366f1" : "#374151",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: "500",
                  color: eraserSize === size ? "#ffffff" : "#9ca3af",
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  if (eraserSize !== size) {
                    e.target.style.backgroundColor = "#4b5563";
                    e.target.style.borderColor = "#6b7280";
                    e.target.style.color = "#e5e7eb";
                  }
                }}
                onMouseLeave={(e) => {
                  if (eraserSize !== size) {
                    e.target.style.backgroundColor = "#374151";
                    e.target.style.borderColor = "#4b5563";
                    e.target.style.color = "#9ca3af";
                  }
                }}
              >
                {size}px
              </button>
            ))}
          </div>
          
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setShowEraserDropdown(false)}
              style={{
                flex: 1,
                padding: "8px 16px",
                backgroundColor: "#6366f1",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => (e.target.style.backgroundColor = "#4f46e5")}
              onMouseLeave={(e) => (e.target.style.backgroundColor = "#6366f1")}
            >
              Start Erasing
            </button>
          </div>
        </div>
      )}

      <canvas
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        ref={canvasRef}
        className={moveCanvas}
        width={window.innerWidth}
        height={window.innerHeight}
        id="canvas"

      />





      {/* Old poll system removed - using PollModal only */}

      {/* Old student poll system completely removed - using PollModal only */}



      {AISearchOpen && (
        <AiSearchPopup userID={userID} onClose={setAISearchOpen} />
      )}

      {/* View PDF Button for Students - HIDDEN (will be used later) */}
      {role === 'student' && showPdfViewer && pdfUrl && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: 1000,
            backgroundColor: "#ffffff",
            padding: "12px 16px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            border: "1px solid #e5e7eb",
            display: "none", // HIDDEN - PDF functionality preserved for later use
            alignItems: "center",
            gap: "12px",
          }}
        >
          <img 
            src={pdfImage} 
            alt="PDF" 
            style={{ width: "24px", height: "24px" }}
          />
          <span style={{ color: "#374151", fontWeight: "500" }}>
            {file && file.fileName ? file.fileName : "PDF Available"}
          </span>
          <button
            onClick={() => {
              setShowPdf(true);
              setShowPdfViewer(false);
            }}
            style={{
              padding: "8px 16px",
              backgroundColor: "#dc2626",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "500",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            View PDF
          </button>
          <button
            onClick={() => setShowPdfViewer(false)}
            style={{
              padding: "4px 8px",
              backgroundColor: "transparent",
              color: "#6b7280",
              border: "none",
              fontSize: "18px",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      )}
      
      {/* Pencil Size Dropdown */}
      {showPencilDropdown && toolType === toolTypes.PENCIL && (
        <div
          style={{
            position: "fixed",
            left: `${Math.min(pencilDropdownPosition.x, window.innerWidth - 220)}px`,
            top: `${Math.min(pencilDropdownPosition.y, window.innerHeight - 280)}px`,
            backgroundColor: "rgba(31, 41, 55, 0.95)",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
            border: "1px solid #4b5563",
            backdropFilter: "blur(10px)",
            zIndex: 2000,
            padding: "16px",
            minWidth: "200px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px"
          }}>
            <div style={{
              width: "24px",
              height: "24px",
              backgroundColor: "#4b5563",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #6b7280"
            }}>
              <span style={{ color: "#e5e7eb", fontSize: "14px" }}>✏️</span>
            </div>
            <span style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "#e5e7eb"
            }}>Pencil Size</span>
          </div>
          
          <div style={{ marginBottom: "16px" }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px"
            }}>
              <span style={{ fontSize: "14px", color: "#9ca3af" }}>Size: {pencilSize}px</span>
              <div style={{
                width: `${Math.min(pencilSize * 4, 24)}px`,
                height: `${Math.min(pencilSize * 4, 24)}px`,
                backgroundColor: selectedColor || "#6b7280",
                borderRadius: "50%",
                border: "2px solid #9ca3af",
                opacity: 0.8
              }} />
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={pencilSize}
              onChange={(e) => setPencilSize(parseInt(e.target.value))}
              style={{
                width: "100%",
                height: "6px",
                borderRadius: "3px",
                background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${((pencilSize - 1) / 9) * 100}%, #374151 ${((pencilSize - 1) / 9) * 100}%, #374151 100%)`,
                outline: "none",
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none"
              }}
            />
          </div>
          
          <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
            {[1, 2, 3, 5, 8].map(size => (
              <button
                key={size}
                onClick={() => {
                  setPencilSize(size);
                }}
                style={{
                  flex: 1,
                  padding: "6px 4px",
                  border: pencilSize === size ? "2px solid #6366f1" : "1px solid #4b5563",
                  borderRadius: "6px",
                  backgroundColor: pencilSize === size ? "#6366f1" : "#374151",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: "500",
                  color: pencilSize === size ? "#ffffff" : "#9ca3af",
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  if (pencilSize !== size) {
                    e.target.style.backgroundColor = "#4b5563";
                    e.target.style.borderColor = "#6b7280";
                    e.target.style.color = "#e5e7eb";
                  }
                }}
                onMouseLeave={(e) => {
                  if (pencilSize !== size) {
                    e.target.style.backgroundColor = "#374151";
                    e.target.style.borderColor = "#4b5563";
                    e.target.style.color = "#9ca3af";
                  }
                }}
              >
                {size}px
              </button>
            ))}
          </div>
          
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setShowPencilDropdown(false)}
              style={{
                flex: 1,
                padding: "8px 16px",
                backgroundColor: "#6366f1",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => (e.target.style.backgroundColor = "#4f46e5")}
              onMouseLeave={(e) => (e.target.style.backgroundColor = "#6366f1")}
            >
              Start Drawing
            </button>
          </div>
        </div>
      )}
      
      {/* Fill Options Dropdown */}
      {showFillDropdown && (
        <div
          style={{
            position: "fixed",
            left: `${Math.min(fillDropdownPosition.x, window.innerWidth - 250)}px`,
            top: `${Math.min(fillDropdownPosition.y, window.innerHeight - 320)}px`,
            backgroundColor: "rgba(31, 41, 55, 0.95)",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)",
            border: "1px solid #4b5563",
            backdropFilter: "blur(10px)",
            zIndex: 2000,
            padding: "16px",
            minWidth: "230px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px"
          }}>
            <div style={{
              width: "24px",
              height: "24px",
              backgroundColor: "#4b5563",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #6b7280"
            }}>
              <span style={{ color: "#e5e7eb", fontSize: "14px" }}>🎨</span>
            </div>
            <span style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "#e5e7eb"
            }}>Fill Options</span>
          </div>
          
          {/* Fill Mode Toggle */}
          <div style={{ marginBottom: "16px" }}>
            <div 
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                padding: "8px",
                borderRadius: "6px",
                backgroundColor: fillShape ? "#6366f1" : "#374151",
                border: "1px solid #4b5563",
                transition: "all 0.2s ease"
              }}
              onClick={(e) => {
                e.stopPropagation();
                dispatch(setFillMode(!fillShape));
              }}
              onMouseEnter={(e) => {
                if (!fillShape) {
                  e.currentTarget.style.backgroundColor = "#4b5563";
                }
              }}
              onMouseLeave={(e) => {
                if (!fillShape) {
                  e.currentTarget.style.backgroundColor = "#374151";
                }
              }}
            >
              <div style={{
                width: "18px",
                height: "18px",
                borderRadius: "3px",
                backgroundColor: fillShape ? "#ffffff" : "transparent",
                border: "2px solid #9ca3af",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                {fillShape && <span style={{ color: "#6366f1", fontSize: "12px" }}>✓</span>}
              </div>
              <span style={{ color: "#e5e7eb", fontSize: "14px", fontWeight: "500" }}>
                Enable Fill
              </span>
            </div>
          </div>
          
          {/* Fill Style Selector */}
          {fillShape && (
            <div style={{ marginBottom: "16px" }}>
              <span style={{ 
                fontSize: "12px", 
                color: "#9ca3af", 
                marginBottom: "8px", 
                display: "block" 
              }}>
                Fill Style: {fillStylee || 'hachure'}
              </span>
              <select
                value={fillStylee || 'hachure'}
                onChange={(e) => {
                  dispatch(setFillStyle(e.target.value));
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  backgroundColor: "#374151",
                  border: "1px solid #4b5563",
                  borderRadius: "6px",
                  color: "#e5e7eb",
                  fontSize: "14px",
                  cursor: "pointer",
                  outline: "none",
                  appearance: "none"
                }}
              >
                <option value="hachure">Hachure</option>
                <option value="solid">Solid</option>
                <option value="zigzag">Zigzag</option>
                <option value="cross-hatch">Cross-hatch</option>
                <option value="dots">Dots</option>
                <option value="sunburst">Sunburst</option>
                <option value="dashed">Dashed</option>
                <option value="zigzag-line">Zigzag Line</option>
              </select>
            </div>
          )}
          
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setShowFillDropdown(false)}
              style={{
                flex: 1,
                padding: "8px 16px",
                backgroundColor: "#6366f1",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => (e.target.style.backgroundColor = "#4f46e5")}
              onMouseLeave={(e) => (e.target.style.backgroundColor = "#6366f1")}
            >
              Apply Settings
            </button>
          </div>
        </div>
      )}

      {/* Shape Dropdown */}
      {showShapeDropdown && (
        <ShapeDropdown
          onClose={() => setShowShapeDropdown(false)}
          position={shapeDropdownPosition}
        />
      )}

      {/* PDF Viewer Toggle Button - HIDDEN (will be used later) */}
      <button
        onClick={() => setShowPdf(true)}
        style={{
          position: "fixed",
          top: "80px",
          left: role === "student" ? "20px" : "150px",
          width: "40px",
          height: "40px",
          display: "none", // HIDDEN - PDF functionality preserved for later use
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffffff",
          borderRadius: "25%",
          border: "none",
          cursor: "pointer",
          transition: "all 0.2s ease",
          boxShadow: "0 4px 12px rgba(138, 134, 136, 0.3)",
          zIndex: 1000,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.1)";
          e.currentTarget.style.backgroundColor = "#ccccccff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.backgroundColor = "#ffffffff";
        }}
      >
        <img
          src={pdfImage}
          alt="pdfimage"
          style={{
            color: "#ffffff",
            height: "30px",
            width: "30px",
          }}
        />
      </button>

      {/* File Upload Section - Teacher Only */}
      {role === "teacher" && (
        <div
          style={{
            position: "fixed",
            top: "80px",
            left: "20px",
            zIndex: 1000,
          }}
        >
          <input
            id="file-upload"
            type="file"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <label
            htmlFor="file-upload"
            style={{
              display: "inline-block",
              padding: "12px 20px",
              backgroundColor: "#6366f1",
              color: "#ffffff",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "500",
              cursor: "pointer",
              transition: "all 0.2s ease",
              boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "#4f46e5")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "#6366f1")
            }
          >
            Upload File
          </label>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {(showPdf ||
        (file &&
          ((typeof file === "string" && file.includes("application/pdf")) ||
            (typeof file === "object" &&
              ((file.fileType && file.fileType.includes("pdf")) ||
                (file.fileName &&
                  file.fileName.toLowerCase().endsWith(".pdf"))))))) && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90vw",
            maxWidth: "1200px",
            height: "80vh",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
            border: "1px solid #e5e7eb",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* PDF Viewer Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 20px",
              borderBottom: "1px solid #e5e7eb",
              backgroundColor: "#f8fafc",
            }}
          >
            <h3
              style={{
                margin: "0",
                fontSize: "18px",
                fontWeight: "600",
                color: "#111827",
              }}
            >
              {file && file.fileName ? file.fileName : "PDF Document"}
            </h3>
            <button
              onClick={() => {
                setShowPdf(false);
                dispatch(clearFile());
              }}
              style={{
                padding: "8px 16px",
                backgroundColor: "#ef4444",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              }}
              onMouseEnter={(e) => (e.target.style.backgroundColor = "#dc2626")}
              onMouseLeave={(e) => (e.target.style.backgroundColor = "#ef4444")}
            >
              Close PDF
            </button>
          </div>

          {/* PDF Viewer Content */}
          <div
            style={{
              flex: "1",
              display: "flex",
              flexDirection: "column",
              padding: "20px",
              gap: "16px",
              overflow: "auto",
            }}
          >
            <div style={{ flex: "2", minHeight: "400px" }}>
              <PdfViewer />
            </div>

            <div
              style={{
                flex: "1",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <WebsiteShareControl
                roomID={roomID}
                userID={userID}
                isTeacher={role === "teacher"}
              />
              {/* <WebsiteDisplay roomID={roomID} userID={userID} /> */}
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Modal Components */}
      <ChatSidebar
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={messages}
        onSendMessage={(message) => {
          const newMessages = [...messages, message];
          emitMessages({
            userID: userID,
            message: message.text,
            roomID: roomID,
            messageCopy: newMessages
          });
          dispatch(setMessages(newMessages));
        }}
        userID={userID}
        roomID={roomID}
        role={role}
        isDarkTheme={isDarkTheme}
      />

      <ImageModal
        isOpen={openImageModal}
        onClose={() => setOpenImageModal(false)}
        onAddImage={(url) => {
          emitImageElement({ x: 100, y: 100, url });
          setOpenImageModal(false);
        }}
      />

      <PollModal
        isOpen={openPollModal}
        onClose={() => {
          setOpenPollModal(false);
          setPollManuallyClosed(true);
        }}
        role={role}
        userID={userID}
        pollData={pollData}
        pollResult={resultPoll || null}
        onCreatePoll={(newPollData) => {
          // Send complete poll data including question, options, correctAnswer, and roomID
          const completeData = { ...newPollData, roomID };
          quiz(completeData);
          setOpenPollModal(false);
        }}
        onAnswerPoll={(answer) => {
          // Handle student poll answer
          if (pollData && answer === pollData.correctAnswer) {
            setResultPoll("Congrats You Have Answered Correctly");
          } else {
            setResultPoll("Oops wrong answer, better luck next time");
          }
          
          // Keep modal open to show result, then auto-close after 5 seconds
          setTimeout(() => {
            setResultPoll("");
            setOpenPollModal(false);
          }, 5000);
        }}
      />
    </div>
  );
};

export default Whiteboard;
