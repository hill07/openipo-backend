import mongoose from 'mongoose';
import User from './src/models/User.js';

const BASE_URL = 'http://localhost:5001/api/auth';
const TEST_EMAIL = `testuser_${Date.now()}@example.com`;
const TEST_PASS = 'Password123!';

async function runTests() {
    try {
        console.log('--- TESTING REGISTER ---');
        let resReg = await fetch(`${BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Test User', email: TEST_EMAIL, password: TEST_PASS })
        });
        let dataReg = await resReg.json();
        if (!resReg.ok) throw new Error(dataReg.message);
        console.log('Register Success:', dataReg);

        await mongoose.connect('mongodb+srv://jroy01520_db_user:hill1234@cluster.o1lz01x.mongodb.net/openipo');
        const userInDb = await User.findOne({ email: TEST_EMAIL });
        if (!userInDb) throw new Error("User not saved in DB");
        console.log("Found User in DB. OTP is:", userInDb.otp);

        const otp = userInDb.otp;

        console.log('\n--- TESTING VERIFY OTP ---');
        let resVerify = await fetch(`${BASE_URL}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: TEST_EMAIL, otp })
        });
        let dataVerify = await resVerify.json();
        if (!resVerify.ok) throw new Error(dataVerify.message);
        console.log('Verify Success:', dataVerify);

        console.log('\n--- TESTING LOGIN ---');
        let resLogin = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASS })
        });
        let dataLogin = await resLogin.json();
        if (!resLogin.ok) throw new Error(dataLogin.message);
        console.log('Login Success:', dataLogin);

        // await mongoose.disconnect();
        console.log('\nALL TESTS PASSED✅');
    } catch (err) {
        console.error('Test Failed:', err.message);
        // process.exit(1);
    }
}

runTests();
