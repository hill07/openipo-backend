export const responseHandler = (res, statusCode, success, data = null, message = '') => {
    return res.status(statusCode).json({
        success,
        data,
        message,
        error: !success ? message : null
    });
};
