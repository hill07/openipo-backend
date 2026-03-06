import nodemailer from "nodemailer";
import logger from "./logger.js";

// Utility to send email, defaults to ethereal for testing if no real SMTP provided
const sendEmail = async ({ to, subject, text, html }) => {
    try {
        let transporter;

        // Check if we have real SMTP credentials in env
        if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {

            // Explicitly verify if the user left the default placeholder values
            if (process.env.SMTP_USER === 'your_email@gmail.com') {
                throw new Error("SMTP credentials are not configured. Please update your .env file.");
            }

            transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_PORT == 465,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });
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
        }

        const info = await transporter.sendMail({
            from: process.env.SMTP_USER ? `"OpenIPO" <${process.env.SMTP_USER}>` : '"OpenIPO Test" <test@openipo.com>', // sender address
            to, // list of receivers
            subject, // Subject line
            text, // plain text body
            html, // html body
        });

        logger.info(`Message sent: ${info.messageId}`);

        // Preview URL is only available for Ethereal
        if (!process.env.SMTP_HOST) {
            logger.info(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        }

        return info;
    } catch (error) {
        logger.error(`Error sending email: ${error.message}`);
        throw new Error("Email Error: " + error.message);
    }
};
export default sendEmail;