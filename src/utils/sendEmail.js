import nodemailer from "nodemailer";
import logger from "./logger.js";

// Utility to send email, defaults to ethereal for testing if no real SMTP provided
const sendEmail = async ({ to, subject, text, html }) => {
    try {
        let transporter;

        // Normalize env vars (common production issue: accidental trailing spaces).
        const smtpHost = process.env.SMTP_HOST?.trim();
        const smtpUser = process.env.SMTP_USER?.trim();
        const smtpPass = process.env.SMTP_PASS?.trim();
        const smtpPort = process.env.SMTP_PORT?.trim();
        const smtpPortNum = smtpPort ? Number(smtpPort) : 587;

        // Debug logging
        console.log('SMTP Config Debug:', {
            smtpHost,
            smtpUser,
            smtpPortNum,
            hasSmtpPass: !!smtpPass,
        });

        // Check if we have real SMTP credentials in env
        if (smtpHost && smtpUser && smtpPass) {

            // Explicitly verify if the user left the default placeholder values
            if (smtpUser === 'your_email@gmail.com') {
                throw new Error("SMTP credentials are not configured. Please update your .env file.");
            }

            transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPortNum,
                secure: smtpPortNum === 465,
                auth: {
                    user: smtpUser,
                    pass: smtpPass,
                },
            });
            console.log('Using real SMTP transporter');
        } else {
            // Create a test account on the fly for Ethereal
            const testAccount = await nodemailer.createTestAccount();

            transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: testAccount.user, // generated ethereal user
                    pass: testAccount.pass, // generated ethereal password
                },
            });
            logger.info(`Initialized Ethereal Email test account: ${testAccount.user}`);
            console.log('Using Ethereal test transporter');
        }

        const info = await transporter.sendMail({
            from: smtpUser ? `"OpenIPO" <${smtpUser}>` : '"OpenIPO Test" <test@openipo.com>', // sender address
            to, // list of receivers
            subject, // Subject line
            text, // plain text body
            html, // html body
        });

        logger.info(`Message sent: ${info.messageId}`);

        // Debug logging
        console.log('Email sent successfully:', info.messageId);

        // Preview URL is only available for Ethereal
        if (!process.env.SMTP_HOST) {
            logger.info(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        }

        return info;
    } catch (error) {
        logger.error(`Error sending email: ${error.message}`, {
            code: error.code,
            response: error.response,
            stack: error.stack,
        });
        // Debug logging
        console.error('Email sending failed:', {
            message: error.message,
            code: error.code,
            response: error.response,
        });
        throw new Error("Email Error: " + error.message);
    }
};
export default sendEmail;