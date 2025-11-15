import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { theme } from '../styles/theme';
import { toggleTheme } from '../Whiteboard/whiteboardSlice';
import { emitThemeChange } from '../socketConn/socketConn';

const TopToolbar = ({ 
  role, 
  userID, 
  roomID, 
  onAISearchOpen, 
  onChatToggle, 
  onPollOpen, 
  sleptStudent,
  isChatOpen = false
}) => {
  const dispatch = useDispatch();
  const isDarkTheme = useSelector((state) => state.whiteboard.isDarkTheme);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleThemeToggle = () => {
    console.log("🎨 Teacher clicking theme toggle");
    console.log("  Current theme:", isDarkTheme ? "blackboard" : "whiteboard");
    
    dispatch(toggleTheme());
    const newTheme = !isDarkTheme;
    
    console.log("  New theme:", newTheme ? "blackboard" : "whiteboard");
    console.log("  Room ID:", roomID);
    console.log("  User ID:", userID);
    

    
    // Emit theme change to all students in the room
    emitThemeChange({ 
      roomID, 
      isDarkTheme: newTheme, 
      userID 
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);

    } else {
      document.exitFullscreen();
      setIsFullscreen(false);

    }
  };

  const buttonBaseStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    border: 'none',
    borderRadius: theme.borderRadius.lg,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    textDecoration: 'none',
    userSelect: 'none'
  };

  const iconButtonStyle = {
    ...buttonBaseStyle,
    width: '44px',
    height: '44px',
    padding: 0
  };

  return (
    <>
      {/* Main Toolbar */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '70px',
        backgroundColor: theme.colors.gray[900],
        borderBottom: `1px solid ${theme.colors.gray[700]}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${theme.spacing.xl}`,
        zIndex: theme.zIndex.dropdown,
        boxShadow: theme.shadow.lg
      }}>
        {/* Left Section - Logo and Room Info */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: theme.spacing.lg 
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.md
          }}>
            {/* Logo - Circular with no container */}
            <img 
              src="/GyaanSetu.png" 
              alt="GyaanSetu Logo" 
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                objectFit: 'cover',
                boxShadow: theme.shadow.md,
                
              }}
            />
            
            {/* App Info */}
            <div>
              <h3 style={{ 
                margin: 0, 
                fontSize: theme.typography.fontSize.lg,
                fontWeight: theme.typography.fontWeight.semibold,
                color: theme.colors.white
              }}>
                Nav Shiksha
              </h3>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.sm,
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.gray[300]
              }}>
                <span>Room: {roomID}</span>
                <span>•</span>
                <span style={{
                  color: role === 'teacher' ? theme.colors.primary[600] : theme.colors.success[600],
                  fontWeight: theme.typography.fontWeight.medium
                }}>
                  {role === 'teacher' ? '🎓 Teacher' : '👨‍🎓 Student'}
                </span>
                <span>•</span>
                <span>{userID}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section - Action Buttons */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: theme.spacing.md 
        }}>
          {/* AI Assistant Button */}
          <button
            onClick={onAISearchOpen}
            style={{
              ...iconButtonStyle,
              background: theme.colors.primary[400], // Lighter shade instead of gradient
              color: theme.colors.white,
              boxShadow: theme.shadow.md
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = theme.shadow.lg;
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = theme.shadow.md;
            }}
            title="AI Assistant"
            >
            <img 
              src="https://cdn-icons-png.flaticon.com/512/18355/18355220.png" 
              alt="AI Assistant Icon" 
              style={{ width: '22px', height: '22px', verticalAlign: 'middle' }} 
            />
            </button>

            {/* Chat Button */}
                    {/* Chat Button */}
          <button
            onClick={onChatToggle}
            style={{
              ...iconButtonStyle,
              backgroundColor: isChatOpen ? theme.colors.secondary[400] : theme.colors.secondary[300], // Lighter shades
              transform: isChatOpen ? 'translateY(-1px)' : 'translateY(0)',
              boxShadow: isChatOpen ? theme.shadow.lg : theme.shadow.md,
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = theme.colors.secondary[500]; // Lighter hover
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = theme.shadow.lg;
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = isChatOpen ? theme.colors.secondary[400] : theme.colors.secondary[300]; // Lighter shades
              e.target.style.transform = isChatOpen ? 'translateY(-1px)' : 'translateY(0)';
              e.target.style.boxShadow = isChatOpen ? theme.shadow.lg : theme.shadow.md;
            }}
            >
            <img 
              src="https://cdn-icons-png.flaticon.com/512/3114/3114553.png" 
              alt="Chat Icon" 
              style={{ width: '22px', height: '22px', marginRight: '3px', verticalAlign: 'middle' }} 
            />
            {isChatOpen && <span style={{ fontSize: '0.8em', marginLeft: '4px' }}>●</span>}
            </button>

            {/* Teacher Poll Button */}
          {role === "teacher" && (
            <button
              onClick={onPollOpen}
              style={{
                ...buttonBaseStyle,
                background: theme.colors.secondary[500], // Lighter shade
                color: theme.colors.white,
                boxShadow: theme.shadow.sm
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.backgroundColor = theme.colors.secondary[600]; // Lighter hover
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.backgroundColor = theme.colors.secondary[500]; // Lighter shade
                }}
              >
                <img 
                src="https://cdn-icons-png.flaticon.com/512/12448/12448255.png" 
                alt="Poll Icon" 
                style={{ width: '22px', height: '22px', marginRight: '8px', verticalAlign: 'middle' }} 
                />
                Poll
              </button>
              )}

              {/* Theme Toggle Button - Only for Teachers */}
          {role === 'teacher' && (
            <button
              onClick={handleThemeToggle}
              style={{
                ...iconButtonStyle,
                background: isDarkTheme ? theme.colors.gray[700] : theme.colors.gray[100], // Lighter shades
                color: isDarkTheme ? theme.colors.white : theme.colors.gray[600],
                border: `1px solid ${isDarkTheme ? theme.colors.gray[500] : theme.colors.gray[200]}`, // Lighter borders
                boxShadow: theme.shadow.sm
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = theme.shadow.md;
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = theme.shadow.sm;
              }}
              title={isDarkTheme ? "Switch to Whiteboard" : "Switch to Blackboard"}
            >
              {isDarkTheme ? "🌙" : "☀️"}
            </button>
          )}

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            style={{
              ...iconButtonStyle,
              background: theme.colors.gray[50], // Very light gray instead of pure white
              color: theme.colors.gray[600],
              border: `1px solid ${theme.colors.gray[200]}`, // Lighter border
              boxShadow: theme.shadow.sm
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = theme.shadow.md;
              e.target.style.borderColor = theme.colors.gray[300]; // Lighter hover border
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = theme.shadow.sm;
              e.target.style.borderColor = theme.colors.gray[200]; // Lighter border
            }}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? "⤓" : "⤢"}
          </button>

          {/* Connection Status Indicator - REMOVED */}
        </div>
      </div>

      {/* Sleeping Student Alert */}
      {role === "teacher" && sleptStudent && (
        <div style={{
          position: "fixed",
          bottom: theme.spacing.xl,
          left: theme.spacing.xl,
          padding: `${theme.spacing.lg} ${theme.spacing.xl}`,
          background: theme.colors.error.gradient || theme.colors.error[500],
          color: theme.colors.white,
          borderRadius: theme.borderRadius.xl,
          fontSize: theme.typography.fontSize.base,
          fontWeight: theme.typography.fontWeight.semibold,
          boxShadow: theme.shadow.xl,
          zIndex: theme.zIndex.dropdown,
          animation: 'pulse 2s infinite',
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.md
        }}>
          <span style={{ fontSize: theme.typography.fontSize.xl }}>😴</span>
          <span>{sleptStudent} is sleeping</span>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.05);
          }
        }
      `}</style>
    </>
  );
};

export default TopToolbar;