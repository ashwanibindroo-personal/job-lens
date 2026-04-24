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

test('does not count Java as a match for JavaScript skills', () => {
  const result = scoreJobMatch({
    jobDescription: 'TypeScript and JavaScript required',
    jobTitle: 'Developer',
    skills: 'Java'
  });
  // "Java" should NOT match "JavaScript" — score must stay low
  expect(result).toBeLessThanOrEqual(3);
});

test('can return a score of 10 for perfect match', () => {
  const result = scoreJobMatch({
    jobDescription: 'react typescript css node.js graphql developer position',
    jobTitle: 'Node.js Developer',
    skills: 'React, TypeScript, CSS, Node.js, GraphQL, Docker'
  });
  expect(result).toBe(10);
});
