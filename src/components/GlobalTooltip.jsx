import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * GlobalTooltip
 * 
 * Provides an unclipped, high-z-index, portal-rendered tooltip across the entire ERP.
 * Bulletproof positioning:
 * 1. Dynamically measures real rendered width & height of the tooltip.
 * 2. Checks available viewport space in all 4 directions (top, bottom, left, right).
 * 3. Auto-flips to the side with maximum clearance if requested side doesn't fit.
 * 4. Clamps strictly within [10px, viewportWidth - 10px] and [10px, viewportHeight - 10px].
 * 5. Prevents any overlapping or truncation by screen edges, sidebars, or tables.
 */
export default function GlobalTooltip() {
  const [tooltip, setTooltip] = useState(null);
  const [coords, setCoords] = useState(null);
  const tooltipRef = useRef(null);
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const activeElRef = useRef(null);

  useEffect(() => {
    function getTooltipTarget(node) {
      if (!node || !(node instanceof Element)) return null;
      return node.closest('[data-tooltip], [title], [data-tooltip-original-title]');
    }

    function handleMouseOver(e) {
      const target = getTooltipTarget(e.target);
      if (!target) return;

      // Extract text from data-tooltip or native title
      let text = target.getAttribute('data-tooltip');
      if (!text && target.hasAttribute('title')) {
        const rawTitle = target.getAttribute('title');
        if (rawTitle && rawTitle.trim()) {
          text = rawTitle.trim();
          target.setAttribute('data-tooltip-original-title', text);
          target.removeAttribute('title'); // Suppress native browser tooltip
        }
      } else if (!text && target.hasAttribute('data-tooltip-original-title')) {
        text = target.getAttribute('data-tooltip-original-title');
      }

      if (!text || !text.trim()) return;

      clearTimeout(showTimerRef.current);
      clearTimeout(hideTimerRef.current);

      activeElRef.current = target;

      showTimerRef.current = setTimeout(() => {
        if (!activeElRef.current) return;
        const rect = activeElRef.current.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const pos = activeElRef.current.getAttribute('data-tooltip-pos') || 'top';
        setTooltip({
          text: text.trim(),
          rect,
          pos,
        });
      }, 70);
    }

    function handleMouseOut(e) {
      const related = e.relatedTarget;
      if (activeElRef.current && related && activeElRef.current.contains(related)) {
        return;
      }

      clearTimeout(showTimerRef.current);
      clearTimeout(hideTimerRef.current);
      activeElRef.current = null;
      hideTimerRef.current = setTimeout(() => {
        setTooltip(null);
        setCoords(null);
      }, 60);
    }

    function handleScrollOrResize() {
      clearTimeout(showTimerRef.current);
      clearTimeout(hideTimerRef.current);
      activeElRef.current = null;
      setTooltip(null);
      setCoords(null);
    }

    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('mouseout', handleMouseOut, true);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, []);

  // Dynamically compute exact pixel placement with boundary clamping
  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) {
      setCoords(null);
      return;
    }

    const { rect, pos } = tooltip;
    const tooltipEl = tooltipRef.current;
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const tooltipW = tooltipRect.width;
    const tooltipH = tooltipRect.height;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const margin = 8;
    const paddingEdge = 10;

    const spaceAbove = rect.top;
    const spaceBelow = viewportH - rect.bottom;
    const spaceLeft = rect.left;
    const spaceRight = viewportW - rect.right;

    let chosenPos = pos;

    // Smart placement flipping based on available space
    if (chosenPos === 'top') {
      if (spaceAbove < tooltipH + margin && spaceBelow >= tooltipH + margin) {
        chosenPos = 'bottom';
      }
    } else if (chosenPos === 'bottom') {
      if (spaceBelow < tooltipH + margin && spaceAbove >= tooltipH + margin) {
        chosenPos = 'top';
      }
    } else if (chosenPos === 'left') {
      if (spaceLeft < tooltipW + margin) {
        if (spaceRight >= tooltipW + margin) {
          chosenPos = 'right';
        } else {
          // If neither side fits horizontally, flip to vertical
          chosenPos = spaceAbove >= spaceBelow ? 'top' : 'bottom';
        }
      }
    } else if (chosenPos === 'right') {
      if (spaceRight < tooltipW + margin) {
        if (spaceLeft >= tooltipW + margin) {
          chosenPos = 'left';
        } else {
          chosenPos = spaceAbove >= spaceBelow ? 'top' : 'bottom';
        }
      }
    }

    let finalLeft = 0;
    let finalTop = 0;

    if (chosenPos === 'top' || chosenPos === 'bottom') {
      // Horizontally center relative to trigger element
      const centerX = rect.left + rect.width / 2;
      const idealLeft = centerX - tooltipW / 2;
      // Clamp strictly within viewport
      finalLeft = Math.max(paddingEdge, Math.min(viewportW - tooltipW - paddingEdge, idealLeft));

      if (chosenPos === 'top') {
        finalTop = Math.max(paddingEdge, rect.top - tooltipH - margin);
      } else {
        finalTop = Math.min(viewportH - tooltipH - paddingEdge, rect.bottom + margin);
      }
    } else {
      // 'left' or 'right'
      const centerY = rect.top + rect.height / 2;
      const idealTop = centerY - tooltipH / 2;
      // Clamp strictly within viewport
      finalTop = Math.max(paddingEdge, Math.min(viewportH - tooltipH - paddingEdge, idealTop));

      if (chosenPos === 'left') {
        finalLeft = Math.max(paddingEdge, rect.left - tooltipW - margin);
      } else {
        finalLeft = Math.min(viewportW - tooltipW - paddingEdge, rect.right + margin);
      }
    }

    setCoords({
      left: Math.round(finalLeft),
      top: Math.round(finalTop),
    });
  }, [tooltip]);

  if (!tooltip) return null;

  const style = {
    position: 'fixed',
    left: coords ? `${coords.left}px` : '-9999px',
    top: coords ? `${coords.top}px` : '-9999px',
    zIndex: 9999999,
    pointerEvents: 'none',
    maxWidth: 'min(340px, calc(100vw - 20px))',
    width: 'max-content',
    background: 'rgba(15, 23, 42, 0.96)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: '#f8fafc',
    fontSize: '0.74rem',
    fontWeight: 500,
    lineHeight: 1.35,
    padding: '0.4rem 0.72rem',
    borderRadius: '7px',
    border: '1px solid rgba(255, 255, 255, 0.16)',
    boxShadow: '0 10px 25px -3px rgba(0, 0, 0, 0.45), 0 4px 10px -2px rgba(0, 0, 0, 0.25)',
    wordBreak: 'break-word',
    whiteSpace: 'normal',
    textAlign: 'center',
    opacity: coords ? 1 : 0,
    transform: 'none',
    transition: 'opacity 0.08s ease',
  };

  return createPortal(
    <div ref={tooltipRef} style={style}>
      {tooltip.text}
    </div>,
    document.body
  );
}
