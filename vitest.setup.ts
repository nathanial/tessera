if (typeof globalThis.Image === "undefined") {
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin?: string;

    set src(_value: string) {
      // Immediately succeed to avoid test noise from missing Image in Node.
      if (this.onload) {
        this.onload();
      }
    }
  }

  // eslint-disable-next-line no-global-assign
  (globalThis as { Image: typeof MockImage }).Image = MockImage;
}
