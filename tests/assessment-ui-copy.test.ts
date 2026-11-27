import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = [
  '../src/features/assessments/components/quiz-session.tsx',
  '../src/features/assessments/components/answer-assessment.tsx',
  '../src/features/assessments/components/assessment-result.tsx',
  '../src/features/assessments/components/attempt-image.tsx'
];

test('assessment attempt screens keep Portuguese UI strings valid UTF-8 instead of Latin-1 mojibake', () => {
  for (const relativePath of files) {
    const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.equal(
      /\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]/u.test(source),
      false,
      `${relativePath} contains mojibake`
    );
  }
});
