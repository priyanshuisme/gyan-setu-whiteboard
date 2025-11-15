"use client";
import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toolTypes } from "../constants";
import { motion } from "framer-motion";
import { theme } from "../styles/theme";
import ImageIcon from "../resources/icons/ImageIcon.svg";
import lineIcon from "../resources/icons/line.svg";
import pencilIcon from "../resources/icons/pencil.svg";
import rectangleIcon from "../resources/icons/rectangle.svg";
import rubberIcon from "../resources/icons/rubber.svg";
import fillBucket from "../resources/icons/fillBucket.svg";
import selectionIcon from "../resources/icons/selection.svg";
import textIcon from "../resources/icons/text.svg";
import { emitClearWhiteboard } from "../socketConn/socketConn";
import { setElements, setToolType } from "./whiteboardSlice";
import ColorPicker from "./utils/ColorPicker";
import Circle from "../resources/icons/circle.svg";
import Bin from "../resources/icons/icons8-bin-50.png";
import ShapeDropdown from "../components/ShapeDropdown";

// Helper function to get the correct icon for shape tools
const getShapeIcon = (toolType) => {
  switch (toolType) {
    case toolTypes.RECTANGLE:
      return rectangleIcon;
    case toolTypes.CIRCLE:
      return Circle;
    case toolTypes.TRIANGLE:
      return '🔺';
    case toolTypes.DIAMOND:
      return '💎';
    case toolTypes.STAR:
      return '⭐';
    case toolTypes.ARROW:
      return '➡️';
    case toolTypes.PENTAGON:
      return '⬠';
    case toolTypes.HEXAGON:
      return '⬡';
    case toolTypes.HEART:
      return '❤️';
    case toolTypes.CLOUD:
      return '☁️';
    default:
      return rectangleIcon;
  }
};

const IconButton = ({ src, type, isRubber, isClearAll, roomID, onEraserClick, onPencilClick, onFillClick, onShapeClick, isShapeButton }) => {
  const dispatch = useDispatch();
  const selectedToolType = useSelector((state) => state.whiteboard.tool);
  const fillShape = useSelector((state) => state.fillShape.filling);

  const handleToolChange = () => {
    dispatch(setToolType(type));
  };

  const handleClearCanvas = () => {
    dispatch(setElements([]));
    emitClearWhiteboard(roomID);
  };

  const handleClick = (event) => {
    if (isClearAll) {
      handleClearCanvas();
    } else if (type === toolTypes.ERASER && onEraserClick) {
      // For eraser, show dropdown and set tool
      event.stopPropagation();
      handleToolChange();
      const rect = event.currentTarget.getBoundingClientRect();
      onEraserClick({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 10
      });
    } else if (type === toolTypes.PENCIL && onPencilClick) {
      // For pencil, show dropdown and set tool
      event.stopPropagation();
      handleToolChange();
      const rect = event.currentTarget.getBoundingClientRect();
      onPencilClick({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 10
      });
    } else if (type === 'FILL' && onFillClick) {
      // For fill, show dropdown
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      onFillClick({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 10
      });
    } else if (isShapeButton && onShapeClick) {
      // For shapes, show dropdown
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      onShapeClick({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 10
      });
    } else {
      handleToolChange();
    }
  };

  const isActive = type === 'FILL' ? fillShape : 
                   isShapeButton ? [toolTypes.RECTANGLE, toolTypes.CIRCLE, toolTypes.TRIANGLE, 
                                    toolTypes.DIAMOND, toolTypes.STAR, toolTypes.ARROW, 
                                    toolTypes.PENTAGON, toolTypes.HEXAGON, toolTypes.HEART, toolTypes.CLOUD].includes(selectedToolType) :
                   selectedToolType === type;
  
  const buttonStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    border: `1px solid ${isActive ? theme.colors.primary[400] : theme.colors.gray[600]}`,
    borderRadius: theme.borderRadius.sm, // Smaller border radius
    backgroundColor: isActive ? theme.colors.primary[500] : theme.colors.gray[700],
    cursor: "pointer",
    padding: "0px",
    transition: `all ${theme.animation.duration.normal} ${theme.animation.easing.default}`,
    boxShadow: isActive 
      ? theme.shadow.md 
      : theme.shadow.sm,
    transform: isActive ? "translateY(-1px)" : "translateY(0)",
  };

  // Check if src is an emoji (single character emojis or unicode emojis)
  const isEmoji = typeof src === 'string' && (src.length <= 4 && !/\.(svg|png|jpg|jpeg|gif)$/i.test(src));

  return (
    <button onClick={handleClick} style={buttonStyle}>
      {isEmoji ? (
        <span 
          style={{
            fontSize: '20px',
            lineHeight: '1',
            opacity: isActive ? 1 : 0.8
          }}
        >
          {src}
        </span>
      ) : (
        <img 
          alt="Tool Icon" 
          width="70%" 
          height="70%" 
          src={src}
          style={{
            filter: 'invert(1) brightness(0.9)', // Make icons light for dark theme
            opacity: isActive ? 1 : 0.8
          }}
        />
      )}
    </button>
  );
};

const Menu = ({ roomID, onEraserClick, onPencilClick, onFillClick }) => {
  const dispatch = useDispatch();
  const [expanded, setExpanded] = useState(false);
  const [showShapeDropdown, setShowShapeDropdown] = useState(false);
  const [shapeDropdownPosition, setShapeDropdownPosition] = useState({ x: 0, y: 0 });
  const selectedToolType = useSelector((state) => state.whiteboard.tool);

  const handleShapeDropdown = (position) => {
    setShapeDropdownPosition(position);
    setShowShapeDropdown(true);
  };

  const handleCloseShapeDropdown = () => {
    setShowShapeDropdown(false);
  };

  // Check if current tool is a shape
  const isShapeTool = [toolTypes.RECTANGLE, toolTypes.CIRCLE, toolTypes.TRIANGLE, 
                       toolTypes.DIAMOND, toolTypes.STAR, toolTypes.ARROW, 
                       toolTypes.PENTAGON, toolTypes.HEXAGON, toolTypes.HEART, toolTypes.CLOUD].includes(selectedToolType);

  // Calculate dynamic widths based on content
  const collapsedWidth = 160; // Reduced collapsed width
  
  // Calculate expanded width with compact sizing
  // ColorPicker: ~100px, Each tool button: ~36px + gap, Clear button: ~40px, Reduced spacing
  const toolCount = 9; // Shapes, Line, Eraser, Pencil, Text, Selection, Image, Fill, Clear
  const toolWidth = 36; // Reduced tool button width
  const toolGap = 16; // Increased gap between tools (theme.spacing.md)
  const colorPickerWidth = 100; // Reduced ColorPicker width
  const clearButtonWidth = 36; // Reduced clear button width to match other buttons
  const padding = 8; // Container outer padding
  
  const calculatedExpandedWidth = colorPickerWidth + (toolCount - 1) * (toolWidth + toolGap) + clearButtonWidth + padding;
  
  // Ensure the width doesn't exceed viewport width with some margin
  const maxWidth = typeof window !== 'undefined' ? Math.min(calculatedExpandedWidth, window.innerWidth - 40) : calculatedExpandedWidth;
  const expandedWidth = Math.max(maxWidth, 500); // Reduced minimum expanded width for more compact layout

  useEffect(() => {
    let timer;
    if (expanded) {
      timer = setTimeout(() => {
        setExpanded(false);
      }, 4000); // collapse after 4 seconds
    }
    return () => clearTimeout(timer);
  }, [expanded]);

  const handleClearAll = () => {
    dispatch(setElements([]));
    emitClearWhiteboard(roomID);
  };

  const toggleExpand = () => {
    setExpanded((prev) => !prev);
  };

  const menuContainerStyle = {
    position: "fixed",
    top: "84px", // Adjusted to avoid overlap with TopToolbar
    left: "50%",
    transform: "translateX(-50%)",
    padding: expanded ? "6px 4px" : "6px 6px", // Minimal outer padding
    backgroundColor: theme.colors.gray[800],
    borderRadius: theme.borderRadius.md, // Smaller border radius
    boxShadow: theme.shadow.lg,
    border: `1px solid ${theme.colors.gray[600]}`,
    zIndex: 999, // Below TopToolbar
    height: expanded ? "auto" : "44px", // Reduced height
    backdropFilter: "blur(10px)",
    background: "rgba(31, 41, 55, 0.95)",
  };

  const collapsedContainerStyle = {
    display: "flex",
    justifyContent: "center",
    gap: "6px", // Reduced gap
    cursor: "pointer",
    width: "100%", // Fill container width
    minWidth: "160px", // Reduced minimum width
    height: "42px", // Reduced height
    alignItems: "center",
    fontWeight: theme.typography.fontWeight.semibold,
    fontSize: theme.typography.fontSize.sm, // Smaller font size
    color: theme.colors.white,
    borderRadius: theme.borderRadius.md, // Smaller border radius
    border: `1px solid ${theme.colors.gray[600]}`,
    userSelect: "none",
    transition: `all ${theme.animation.duration.normal} ${theme.animation.easing.default}`,
    background: `linear-gradient(135deg, ${theme.colors.gray[700]} 0%, ${theme.colors.gray[600]} 100%)`,
  };

  const expandedContentStyle = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center", // Center content within container
    gap: theme.spacing.md, // Increased gap between elements for better separation
    padding: "0", // No inner padding - let container handle outer padding
    width: "100%",
    flexWrap: "nowrap", // Prevent wrapping
    // overflow: "hidden", // Hide overflow if needed
  };

  return (
    <motion.div
      style={menuContainerStyle}
      initial={{ width: collapsedWidth }}
      animate={{ width: expanded ? expandedWidth : collapsedWidth }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      {!expanded ? (
        <div
          style={collapsedContainerStyle}
          onClick={toggleExpand}
          title="Expand Tools"
        >
          <img
            src="https://cdn-icons-png.flaticon.com/512/7168/7168912.png"
            alt="Palette Icon"
            height={22}
            width={22}
            style={{ marginRight: "8px", verticalAlign: "middle", filter: "invert(1) brightness(2)" }}
          />
          Drawing Toolkit
        </div>
      ) : (
        <div style={expandedContentStyle}>
          {/* Color Picker */}
          <ColorPicker />

          {/* Tool Buttons */}
          <IconButton 
            src={isShapeTool ? getShapeIcon(selectedToolType) : rectangleIcon} 
            type="SHAPES" 
            isShapeButton={true}
            onShapeClick={handleShapeDropdown}
          />
          <IconButton src={lineIcon} type={toolTypes.LINE} />
          <IconButton src={rubberIcon} type={toolTypes.ERASER} onEraserClick={onEraserClick} />
          <IconButton src={pencilIcon} type={toolTypes.PENCIL} onPencilClick={onPencilClick} />
          <IconButton src={textIcon} type={toolTypes.TEXT} />
          <IconButton src={selectionIcon} type={toolTypes.SELECTION} />
          <IconButton src={ImageIcon} type={toolTypes.IMAGE} />
          {/* Fill Tool Button - opens dropdown */}
          <IconButton 
            src={fillBucket} 
            type="FILL" 
            onFillClick={onFillClick}
          />

          {/* Clear All Button */}
          <button
            onClick={handleClearAll}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px", // Reduced to match other buttons
              height: "36px", // Reduced to match other buttons
              border: `1px solid ${theme.colors.error[400]}`,
              borderRadius: theme.borderRadius.sm, // Smaller border radius
              backgroundColor: theme.colors.gray[700],
              cursor: "pointer",
              transition: `all ${theme.animation.duration.normal} ${theme.animation.easing.default}`,
              boxShadow: theme.shadow.sm,
            }}
            title="Clear All Elements"
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = theme.colors.error[50];
              e.target.style.transform = "translateY(-1px)";
              e.target.style.boxShadow = theme.shadow.md;
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = theme.colors.white;
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = theme.shadow.sm;
            }}
          >
            <img src={Bin} alt="Clear All" height={20} width={20} style={{ filter: "invert(1) brightness(2)" }} />
          </button>

        </div>
      )}
      
      {/* Shapes Dropdown */}
      {showShapeDropdown && (
        <ShapeDropdown 
          position={shapeDropdownPosition}
          onClose={handleCloseShapeDropdown}
        />
      )}
    </motion.div>
  );
};

export default Menu;