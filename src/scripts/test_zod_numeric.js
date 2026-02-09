import { z } from 'zod';

const numeric = z.preprocess((a) => {
    if (typeof a === 'string') {
        if (a.trim() === '') return undefined;
        // Strip commas and then parse
        return parseFloat(a.replace(/,/g, ''));
    }
    return a;
}, z.number().optional().nullable());

const schema = z.object({
    value: numeric
});

const testCases = [
    { input: "1,819.80", expected: 1819.8 },
    { input: "2,514.66", expected: 2514.66 },
    { input: "100", expected: 100 },
    { input: "", expected: undefined },
    { input: "1,234,567.89", expected: 1234567.89 }
];

console.log("Running Zod Numeric Validator Tests...");

let passed = 0;
testCases.forEach(({ input, expected }, index) => {
    try {
        const result = schema.parse({ value: input });
        if (result.value === expected) {
            console.log(`✅ Test ${index + 1} Passed: Input "${input}" parsed to ${result.value}`);
            passed++;
        } else {
            console.error(`❌ Test ${index + 1} Failed: Input "${input}" parsed to ${result.value}, expected ${expected}`);
        }
    } catch (e) {
        console.error(`❌ Test ${index + 1} Error:`, e.message);
    }
});

console.log(`\nResults: ${passed}/${testCases.length} passed.`);
if (passed === testCases.length) {
    console.log("All tests passed!");
    process.exit(0);
} else {
    console.log("Some tests failed.");
    process.exit(1);
}
