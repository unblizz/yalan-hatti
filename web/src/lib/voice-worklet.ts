const source = `class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'pitch', defaultValue: 1, minValue: 0.5, maxValue: 2, automationRate: 'k-rate' }]
  }

  constructor() {
    super()
    this.size = 8192
    this.window = 1536
    this.buffer = new Float32Array(this.size)
    this.write = 0
    this.phase = 0
  }

  read(delay) {
    let pos = this.write - delay
    while (pos < 0) pos += this.size
    const i = Math.floor(pos)
    const frac = pos - i
    const a = this.buffer[i % this.size]
    const b = this.buffer[(i + 1) % this.size]
    return a + (b - a) * frac
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    const output = outputs[0]
    if (!input || input.length === 0) return true
    const source = input[0]
    const pitch = parameters.pitch[0]
    const step = (1 - pitch) / this.window
    for (let n = 0; n < source.length; n++) {
      this.buffer[this.write] = source[n]
      this.phase += step
      if (this.phase >= 1) this.phase -= 1
      if (this.phase < 0) this.phase += 1
      const p2 = (this.phase + 0.5) % 1
      const g1 = Math.sin(Math.PI * this.phase)
      const g2 = Math.sin(Math.PI * p2)
      const sample = this.read(this.phase * this.window + 2) * g1 * g1 + this.read(p2 * this.window + 2) * g2 * g2
      for (let c = 0; c < output.length; c++) output[c][n] = sample
      this.write = (this.write + 1) % this.size
    }
    return true
  }
}

registerProcessor('pitch-shifter', PitchShifter)
`

export function voiceWorkletUrl(): string {
  return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
}
