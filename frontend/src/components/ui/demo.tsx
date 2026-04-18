'use client'

import * as React from 'react'
import { Waves } from '@/components/ui/wave-background'

export function WavesDemo() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-blue-50">
      <div className="w-full">
        <div className="h-[1px] w-full bg-blue-200" />
        <div className="relative w-full aspect-video">
          <Waves className="h-full w-full" strokeColor="#bfdbfe" backgroundColor="#eff6ff" pointerSize={0.35} />
        </div>
        <div className="h-[1px] w-full bg-blue-200" />
      </div>
    </div>
  )
}

export { WavesDemo }
