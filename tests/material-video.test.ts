import test from 'node:test';
import assert from 'node:assert/strict';
import { videoSource } from '../src/lib/material-video.ts';

test('video accepts HTTPS sources and embeds only recognized providers', () => {
  assert.deepEqual(videoSource(' https://youtu.be/abcdefghijk?t=4 '), { url: 'https://youtu.be/abcdefghijk?t=4', embed: 'https://www.youtube-nocookie.com/embed/abcdefghijk' });
  assert.equal(videoSource('https://www.youtube.com/watch?v=abcdefghijk')?.embed, 'https://www.youtube-nocookie.com/embed/abcdefghijk');
  assert.equal(videoSource('https://vimeo.com/123456')?.embed, 'https://player.vimeo.com/video/123456');
  assert.equal(videoSource('https://example.org/video')?.embed, undefined);
});

test('unsafe, malformed or credentialed video sources never become links or frames', () => {
  for (const url of ['', 'video', 'javascript:alert(1)', 'data:text/html,hi', 'http://example.org', 'https://u:p@example.org']) assert.equal(videoSource(url), null);
  for (const url of ['https://youtube.com.evil.org/watch?v=abcdefghijk', 'https://www.youtube.com/watch?v=../unsafe', 'https://vimeo.com/abc']) assert.equal(videoSource(url)?.embed, undefined);
});
