/* eslint-disable react-refresh/only-export-components */
// Dropdown animasi (desain dipilih user 2026-07-12) — port dari komponen
// motion/react (framer-motion) versi TS/shadcn ke JSX + token tema SellerOS.
// Perilaku dipertahankan: click-away, Escape, auto placement top/bottom,
// spring scale+slide sesuai kombinasi placement/side/align.
import { useRef, useState, useEffect, useMemo, useContext, createContext } from 'react'
import { AnimatePresence, motion } from 'motion/react'

export function useClickAway(refs, callback) {
  useEffect(() => {
    const handleClick = (event) => {
      const refsArray = Array.isArray(refs) ? refs : [refs]
      const isOutside = refsArray.every(
        (ref) => ref.current && !ref.current.contains(event.target)
      )
      if (isOutside) callback()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [refs, callback])
}

export function useKeyPress(targetKey, callback) {
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.key === targetKey) callback()
    }
    document.addEventListener('keydown', handleKeyPress)
    return () => document.removeEventListener('keydown', handleKeyPress)
  }, [targetKey, callback])
}

const DropdownContext = createContext(undefined)

const useDropdownContext = () => {
  const context = useContext(DropdownContext)
  if (!context) throw new Error('Dropdown components must be used within a Dropdown component')
  return context
}

export function Dropdown({ children, className = '' }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const contentRef = useRef(null)
  return (
    <DropdownContext.Provider value={{ open, setOpen, triggerRef, contentRef }}>
      <div className={`relative inline-block text-left ${className}`}>{children}</div>
    </DropdownContext.Provider>
  )
}

export function DropdownTrigger({ children, className = '' }) {
  const { open, setOpen, triggerRef } = useDropdownContext()
  return (
    <div
      ref={triggerRef}
      onClick={() => setOpen(!open)}
      className={`inline-flex ${className}`}
      aria-expanded={open}
      aria-haspopup="true"
    >
      {children}
    </div>
  )
}

export function DropdownContent({
  children, className = '', align = 'start', side = 'left', placement = 'auto', sideOffset = 6,
}) {
  const { open, setOpen, triggerRef, contentRef } = useDropdownContext()

  useClickAway([triggerRef, contentRef], () => { if (open) setOpen(false) })
  useKeyPress('Escape', () => { if (open) setOpen(false) })

  const [actualPlacement, setActualPlacement] = useState(placement)

  useEffect(() => {
    if (!open || placement !== 'auto' || !triggerRef.current || !contentRef.current) return
    const triggerRect = triggerRef.current.getBoundingClientRect()
    const contentRect = contentRef.current.getBoundingClientRect()
    const spaceAbove = triggerRect.top
    const spaceBelow = window.innerHeight - triggerRect.bottom
    const contentHeight = contentRect.height
    if (spaceBelow < contentHeight && spaceAbove > spaceBelow) setActualPlacement('top')
    else setActualPlacement('bottom')
  }, [open, placement, triggerRef, contentRef])

  const alignmentClasses = {
    start: side === 'left' ? 'left-0' : 'right-0',
    center: 'left-1/2 -translate-x-1/2',
    end: side === 'left' ? 'right-0' : 'left-0',
  }[align]

  // Offset via inline style — kelas dinamis mt-${n} tak terlihat Tailwind JIT.
  const positionClasses = actualPlacement === 'top' ? 'bottom-full' : 'top-full'
  const offsetStyle = actualPlacement === 'top'
    ? { marginBottom: sideOffset }
    : { marginTop: sideOffset }

  const getTransformOrigin = () => {
    if (actualPlacement === 'top') {
      if (align === 'center') return 'bottom center'
      if ((side === 'left' && align === 'start') || (side === 'right' && align === 'end')) return 'bottom left'
      return 'bottom right'
    }
    if (align === 'center') return 'top center'
    if ((side === 'left' && align === 'start') || (side === 'right' && align === 'end')) return 'top left'
    return 'top right'
  }

  const dropdownVariants = useMemo(() => {
    const yOffset = actualPlacement === 'top' ? 5 : -5
    let xOffset = 0
    if (align === 'center') xOffset = 0
    else if (align === 'start') xOffset = side === 'left' ? -5 : 5
    else if (align === 'end') xOffset = side === 'left' ? 5 : -5
    return {
      hidden: {
        opacity: 0, y: yOffset, x: xOffset, scale: 0.95,
        transition: {
          y: { type: 'spring', stiffness: 700, damping: 35 },
          x: { type: 'spring', stiffness: 700, damping: 35 },
          opacity: { duration: 0.1, ease: 'easeInOut' },
          scale: { duration: 0.1, ease: 'easeInOut' },
        },
      },
      visible: {
        opacity: 1, y: 0, x: 0, scale: 1,
        transition: {
          y: { type: 'spring', stiffness: 700, damping: 35 },
          x: { type: 'spring', stiffness: 700, damping: 35 },
          opacity: { duration: 0.15, ease: 'easeInOut' },
          scale: { duration: 0.1, ease: 'easeInOut' },
        },
      },
      exit: {
        opacity: 0, y: yOffset, x: xOffset, scale: 0.95,
        transition: {
          y: { type: 'spring', stiffness: 500, damping: 25 },
          x: { type: 'spring', stiffness: 500, damping: 25 },
          opacity: { duration: 0.1, ease: 'easeInOut' },
          scale: { duration: 0.1, ease: 'easeInOut' },
        },
      },
    }
  }, [actualPlacement, side, align])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={contentRef}
          variants={dropdownVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{ transformOrigin: getTransformOrigin(), ...offsetStyle }}
          className={`absolute z-[9999] min-w-[8rem] overflow-hidden rounded-xl border border-line/10 bg-surface text-ink p-1 shadow-lg ${positionClasses} ${alignmentClasses} ${className}`}
          role="menu"
          aria-orientation="vertical"
          tabIndex={-1}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function DropdownItem({ children, className = '', onClick, disabled = false, destructive = false }) {
  const { setOpen } = useDropdownContext()
  const handleClick = () => {
    if (disabled) return
    if (onClick) onClick()
    setOpen(false)
  }
  return (
    <button
      className={`relative flex w-full cursor-pointer select-none items-center rounded-lg px-2 py-2 text-sm outline-none transition-colors ${
        disabled
          ? 'pointer-events-none opacity-50 text-ink-faint'
          : destructive
            ? 'text-red-400 hover:bg-red-500/10 focus:bg-red-500/10'
            : 'text-ink-muted hover:bg-fill/10 hover:text-ink focus:bg-fill/10 focus:text-ink'
      } ${className}`}
      onClick={handleClick}
      role="menuitem"
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function DropdownSeparator({ className = '' }) {
  return <div className={`mx-1 my-1 h-px bg-line/10 ${className}`} role="separator" />
}
