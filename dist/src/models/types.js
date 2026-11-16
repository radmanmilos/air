export class ModelProviderError extends Error {
    code;
    provider;
    model;
    statusCode;
    name = 'ModelProviderError';
    constructor(code, message, provider, model, statusCode, options) {
        super(message, options);
        this.code = code;
        this.provider = provider;
        this.model = model;
        this.statusCode = statusCode;
    }
}
