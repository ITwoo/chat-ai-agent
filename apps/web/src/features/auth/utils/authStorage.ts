let accessToken: string | null = null;

export function saveAccessToken(token: string) {
    accessToken = token;
}

export function getAccessToken() {
    return accessToken;
}

export function removeAccessToken() {
    accessToken = null;
}

