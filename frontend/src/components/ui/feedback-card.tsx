'use client'

import { Angry, Check, Frown, Laugh, Loader2, Smile } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const feedbackOptions = [
  { happiness: 4, emoji: Laugh, color: 'text-emerald-600' },
  { happiness: 3, emoji: Smile, color: 'text-blue-500' },
  { happiness: 2, emoji: Frown, color: 'text-amber-500' },
  { happiness: 1, emoji: Angry, color: 'text-rose-600' },
]

export const FeedbackCard = ({ onComplete }: { onComplete?: () => void }) => {
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [happiness, setHappiness] = useState<null | number>(null)
  const [isSubmitted, setSubmissionState] = useState(false)
  const { submitFeedback, isLoading, isSent } = useSubmitFeedback()

  useEffect(() => {
    if (!happiness && textRef.current) {
      textRef.current.value = ''
    }
  }, [happiness])

  useEffect(() => {
    let resetTimeout: ReturnType<typeof setTimeout> | null = null
    let submissionStateTimeout: ReturnType<typeof setTimeout> | null = null

    if (isSent) {
      setSubmissionState(true)

      resetTimeout = setTimeout(() => {
        setHappiness(null)
        if (textRef.current) textRef.current.value = ''
      }, 2000)

      submissionStateTimeout = setTimeout(() => {
        setSubmissionState(false)
        onComplete?.()
      }, 2200)
    }

    return () => {
      if (resetTimeout) clearTimeout(resetTimeout)
      if (submissionStateTimeout) clearTimeout(submissionStateTimeout)
    }
  }, [isSent, onComplete])

  return (
    <motion.div
      layout
      initial={{ borderRadius: '2rem' }}
      animate={happiness ? { borderRadius: '0.75rem' } : { borderRadius: '2rem' }}
      className={cn('w-fit overflow-hidden border border-blue-100 bg-white py-2 shadow-[0_8px_30px_rgba(37,99,235,0.12)]')}
    >
      <span className="flex items-center justify-center gap-3 pl-4 pr-2">
        <div className="text-sm font-medium text-slate-800">How was your experience?</div>
        <div className="flex items-center text-slate-400">
          {feedbackOptions.map((item) => {
            const EmojiIcon = item.emoji
            return (
              <button
                onClick={() => setHappiness((prev) => (item.happiness === prev ? null : item.happiness))}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full transition-all',
                  happiness === item.happiness ? item.color : 'text-slate-400',
                )}
                key={item.happiness}
              >
                <EmojiIcon size={18} />
              </button>
            )
          })}
        </div>
      </span>

      <motion.div
        aria-hidden={!happiness}
        initial={{ height: 0, translateY: 15 }}
        className="px-2"
        transition={{ ease: 'easeInOut', duration: 0.3 }}
        animate={happiness ? { height: '195px', width: '330px' } : {}}
      >
        <AnimatePresence>
          {!isSubmitted ? (
            <motion.span exit={{ opacity: 0 }} initial={{ opacity: 1 }}>
              <textarea
                ref={textRef}
                placeholder="Share your feedback"
                className="min-h-32 w-full resize-none rounded-md border border-blue-100 bg-white p-2 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-300 focus:outline-0"
              />
              <div className="flex h-fit w-full justify-end">
                <button
                  onClick={() => submitFeedback(happiness!, textRef.current?.value || '')}
                  className={cn(
                    'mt-1 flex h-9 items-center justify-center rounded-md bg-gradient-to-r from-[#1B2B6B] to-[#2563EB] px-3 text-sm font-semibold text-white',
                    { 'opacity-60': isLoading },
                  )}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending
                    </>
                  ) : (
                    'Submit'
                  )}
                </button>
              </div>
            </motion.span>
          ) : (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="flex h-full w-full flex-col items-center justify-start gap-2 pt-9 text-sm font-normal text-slate-700"
            >
              <motion.div variants={item} className="flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full bg-blue-500">
                <Check strokeWidth={2.5} size={16} className="stroke-white" />
              </motion.div>
              <motion.div variants={item}>Your feedback has been received.</motion.div>
              <motion.div variants={item}>Thank you. Redirecting to home...</motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}

const container = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      staggerChildren: 0.04,
    },
  },
}

const item = {
  hidden: { y: 10 },
  show: { y: 0 },
}

const useSubmitFeedback = () => {
  const [feedback, setFeedback] = useState<{ happiness: number; feedback: string } | null>(null)
  const [isLoading, setLoadingState] = useState(false)
  const [error, setError] = useState<{ error: unknown } | null>(null)
  const [isSent, setRequestState] = useState(false)

  const submitFeedbackApi = (payload: { happiness: number; feedback: string }) =>
    new Promise((resolve) => setTimeout(() => resolve(payload), 1000))

  useEffect(() => {
    if (!feedback) return

    setLoadingState(true)
    setRequestState(false)

    submitFeedbackApi(feedback)
      .then(() => {
        setRequestState(true)
        setError(null)
      })
      .catch(() => {
        setRequestState(false)
        setError({ error: 'some error' })
      })
      .finally(() => setLoadingState(false))
  }, [feedback])

  return {
    submitFeedback: (happiness: number, message: string) => setFeedback({ happiness, feedback: message }),
    isLoading,
    error,
    isSent,
  }
}
