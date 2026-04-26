import type { Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
export declare const READ_ONLY_SCOPE = "readonly";
export declare class SimpleOAuthProvider implements OAuthServerProvider {
    private secret;
    private readOnlySecret;
    constructor(secret: string, readOnlySecret?: string);
    /**
     * Classify a raw token submitted on the authorize page.
     * Returns "full" for the primary token, "readonly" for the read-only token,
     * or null if the token does not match either.
     */
    classifyToken(token: string): "full" | "readonly" | null;
    get clientsStore(): OAuthRegisteredClientsStore;
    authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void>;
    challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string>;
    exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<OAuthTokens>;
    exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string): Promise<OAuthTokens>;
    verifyAccessToken(token: string): Promise<AuthInfo>;
    revokeToken(_client: OAuthClientInformationFull, _request: OAuthTokenRevocationRequest): Promise<void>;
    /**
     * Generate a signed authorization code. Called from the /approve endpoint.
     * `readOnly` tags the code so the resulting access token is limited to read scopes.
     */
    generateAuthorizationCode(clientId: string, codeChallenge: string, redirectUri: string, readOnly?: boolean): string;
}
