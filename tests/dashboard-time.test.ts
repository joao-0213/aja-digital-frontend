import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardDeadlineLabel } from '../src/lib/dashboard-time.ts';

test('dashboard deadline cards use São Paulo time across a UTC date boundary', () => {
  assert.equal(dashboardDeadlineLabel('2031-06-16T00:30:00.000Z'), '15 de jun. · 21:30');
});

test('dashboard deadline cards preserve São Paulo afternoon time', () => {
  assert.equal(dashboardDeadlineLabel('2031-06-16T18:45:00.000Z'), '16 de jun. · 15:45');
});
