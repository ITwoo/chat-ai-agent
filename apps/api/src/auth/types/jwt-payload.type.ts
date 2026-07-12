export type JwtPayload = {
    sub: number;
    username: string;
    lat?: number;
    exp?: number;
}