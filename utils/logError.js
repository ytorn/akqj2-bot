export const logError = (context, err, user) => {
    const base = {
        context,
        message: err?.message || 'Unknown error',
        name: err?.name || 'Error',
        time: new Date().toISOString(),
        user
    };

    if (err?.response) {
        base.api = {
            status: err.response.status,
            statusText: err.response.statusText,
            data: err.response.data ? 
                (typeof err.response.data === 'string' ? 
                    err.response.data.slice(0, 500) : 
                    JSON.stringify(err.response.data).slice(0, 500)) : 
                'No data'
        };
    }

    console.error('❌ Error:', base);
};
