import { describe, expect, it } from 'vitest'
import { features } from '@/framework'

describe('feature registry (drill b)', () => {
  it('contains the example feature', () => {
    expect(features.map((f) => f.id)).toContain('example')
  })
})
