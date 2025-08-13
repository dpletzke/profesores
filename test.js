//make tests
const assert = require('assert');
const { summaryIsAlreadyinFile } = require('./makeClassSummaries');
const { readSummaryFile, writeSummaryFile } = require('./classSummaryHelpers');
const fs = require('fs');
const path = require('path');

describe('makeClassSummaries', () => {
  const testFilePath = path.join(__dirname, 'testSummary.txt');

  beforeEach(() => {
    // Clear the test file before each test
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  after(() => {
    // Clean up the test file after all tests
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  it('should return false if summary is not in file', () => {
    const result = summaryIsAlreadyinFile({
      workingFile: testFilePath,
      date: '2023-10-01',
      summary: 'Test summary',
      student: 'John Doe'
    });
    assert.strictEqual(result, false);
  });

  it('should return true if summary is already in file', () => {
    const lines = [
      '# John Doe',
      '## 2023-10-01',
      'Test summary'
    ];
    writeSummaryFile(testFilePath, lines);

    const result = summaryIsAlreadyinFile({
      workingFile: testFilePath,
      date: '2023-10-01',
      summary: 'Test summary',
      student: 'John Doe'
    });
    assert.strictEqual(result, true);
  });

  it('should inject a new summary into the file', () => {
    const lines = [
      '# John Doe',
      '## 2023-09-30',
      'Previous summary'
    ];
    writeSummaryFile(testFilePath, lines);

    const updatedLines = injectSummary(lines, 'John Doe', '2023-10-01', 'New summary');
    writeSummaryFile(testFilePath, updatedLines);

    const readLines = readSummaryFile(testFilePath);
    assert.strictEqual(readLines.length, 4);
    assert.strictEqual(readLines[2], '## 2023-10-01');
    assert.strictEqual(readLines[3], 'New summary');
  });
});
