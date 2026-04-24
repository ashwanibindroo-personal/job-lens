const { scoreJobMatch } = require('../background');

test('returns high score when job matches title and skills', () => {
  const result = scoreJobMatch({
    jobDescription: 'We are looking for a Frontend Developer with React and TypeScript experience',
    jobTitle: 'Frontend Developer',
    skills: 'React, TypeScript'
  });
  expect(result).toBeGreaterThanOrEqual(7);
});

test('returns low score for unrelated job', () => {
  const result = scoreJobMatch({
    jobDescription: 'Licensed plumber needed for residential pipe installation work',
    jobTitle: 'Frontend Developer',
    skills: 'React, TypeScript'
  });
  expect(result).toBeLessThanOrEqual(3);
});

test('returns integer between 1 and 10', () => {
  const result = scoreJobMatch({
    jobDescription: 'Some generic job posting with no relevant keywords',
    jobTitle: 'Developer',
    skills: 'JavaScript'
  });
  expect(Number.isInteger(result)).toBe(true);
  expect(result).toBeGreaterThanOrEqual(1);
  expect(result).toBeLessThanOrEqual(10);
});

test('partial skill match returns mid-range score', () => {
  const result = scoreJobMatch({
    jobDescription: 'React developer position, CSS experience a plus',
    jobTitle: 'Frontend Developer',
    skills: 'React, TypeScript, CSS, Node.js'
  });
  expect(result).toBeGreaterThanOrEqual(4);
  expect(result).toBeLessThanOrEqual(8);
});
