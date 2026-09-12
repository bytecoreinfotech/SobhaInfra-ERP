import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * GlobalTooltip
 * 
 * Provides an unclipped, high-z-index, portal-rendered tooltip across the entire ERP.
 * Solves:
 * 1. Tooltips being overlapped or chopped off by table overflow-x: auto, cards, or sticky headers.
 * 2. Tooltips overflowing beyond the viewport left/right/top boundaries.
 * 3. Works seamlessly with existing data-tooltip="..." and title="..." attributes.
 */
export default function GlobalTooltip() {
  const [tooltip, setTooltip] = useState(null);
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
          target.removeAttribute('title'); // Suppress native ugly browser tooltip
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
      }, 60);
    }

    function handleScrollOrResize() {
      clearTimeout(showTimerRef.current);
      clearTimeout(hideTimerRef.current);
      activeElRef.current = null;
      setTooltip(null);
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

  if (!tooltip) return null;

  const { text, rect, pos } = tooltip;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  // Auto-flip if near edge
  let preferredPos = pos;
  if (preferredPos === 'top' && rect.top < 46) preferredPos = 'bottom';
  else if (preferredPos === 'bottom' && rect.bottom > viewportH - 46) preferredPos = 'top';
  else if (preferredPos === 'left' && rect.left < 150) preferredPos = 'right';
  else if (preferredPos === 'right' && rect.right > viewportW - 150) preferredPos = 'left';

  const style = {
    position: 'fixed',
    zIndex: 9999999,
    pointerEvents: 'none',
    maxWidth: 'min(300px, calc(100vw - 24px))',
    width: 'max-content',
    background: 'rgba(15, 23, 42, 0.96)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: '#f8fafc',
    fontSize: '0.74rem',
    fontWeight: 500,
    lineHeight: 1.35,
    padding: '0.38rem 0.68rem',
    borderRadius: '7px',
    border: '1px solid rgba(255, 255, 255, 0.16)',
    boxShadow: '0 10px 25px -3px rgba(0, 0, 0, 0.45), 0 4px 10px -2px rgba(0, 0, 0, 0.25)',
    wordBreak: 'break-word',
    whiteSpace: 'normal',
    textAlign: 'center',
    animation: 'globalTooltipFadeIn 0.12s ease-out',
    transition: 'opacity 0.1s ease',
  };

  if (preferredPos === 'top') {
    const rawLeft = rect.left + rect.width / 2;
    const clampedLeft = Math.max(130, Math.min(viewportW - 130, rawLeft));
    style.left = `${clampedLeft}px`;
    style.top = `${Math.max(10, rect.top - 8)}px`;
    style.transform = 'translate(-50%, -100%)';
  } else if (preferredPos === 'bottom') {
    const rawLeft = rect.left + rect.width / 2;
    const clampedLeft = Math.max(130, Math.min(viewportW - 130, rawLeft));
    style.left = `${clampedLeft}px`;
    style.top = `${Math.min(viewportH - 10, rect.bottom + 8)}px`;
    style.transform = 'translate(-50%, 0)';
  } else if (preferredPos === 'left') {
    const rawTop = rect.top + rect.height / 2;
    const clampedTop = Math.max(20, Math.min(viewportH - 20, rawTop));
    style.left = `${Math.max(12, rect.left - 8)}px`;
    style.top = `${clampedTop}px`;
    style.transform = 'translate(-100%, -50%)';
  } else if (preferredPos === 'right') {
    const rawTop = rect.top + rect.height / 2;
    const clampedTop = Math.max(20, Math.min(viewportH - 20, rawTop));
    style.left = `${Math.min(viewportW - 12, rect.right + 8)}px`;
    style.top = `${clampedTop}px`;
    style.transform = 'translate(0, -50%)';
  }

  return createPortal(
    <div style={style}>
      {text}
    </div>,
    document.body
  );
}
