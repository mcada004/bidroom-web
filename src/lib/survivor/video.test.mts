import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoSource } from './video.ts';

test('normalizes supported video links and rejects unsafe embeds', () => {
  assert.deepEqual(videoSource('https://youtu.be/dQw4w9WgXcQ'), { kind: 'embed', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0' });
  assert.equal(videoSource('https://vimeo.com/123456')?.kind, 'embed');
  assert.equal(videoSource('https://example.com/my-video.mp4?token=abc')?.kind, 'file');
  assert.equal(videoSource('javascript:alert(1)'), null);
  assert.equal(videoSource('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(videoSource('https://example.com/unknown-page'), null);
});
