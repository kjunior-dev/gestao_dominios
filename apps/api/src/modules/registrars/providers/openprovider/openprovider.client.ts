import {Inject, Injectable} from '@nestjs/common';
import {setTimeout as delay} from 'node:timers/promises';
import {RuntimeService} from '../../../../common/runtime.service';
import {digest} from '../../../../common/crypto';
import {RegistrarError, RegistrarDiagnostic} from '../../domain/registrar.types';
import {envelopeSchema, parseExactJson, classifyOpenproviderFailure} from './openprovider.types';

@Injectable()
export class OpenproviderClient {
    constructor(@Inject(RuntimeService) private runtime: RuntimeService) {
    }

    async send(path: string, method: 'GET' | 'POST', body?: unknown, token?: string): Promise<unknown> {
        const e = this.runtime.env;
        if (!e.OPENPROVIDER_ENABLED) throw new RegistrarError('PROVIDER_DISABLED');
        if (!/^\/(auth\/login|domains\/(check|prices)|tlds(?:\/[a-z0-9.-]+)?)(?:\?|$)/.test(path)) throw new RegistrarError('CAPABILITY_UNSUPPORTED');
        const operation = path.split('?')[0].replace(/^\/tlds\/.+$/, '/tlds/:extension');
        const login = operation === '/auth/login',
            scope = digest(JSON.stringify([e.OPENPROVIDER_BASE_URL, e.OPENPROVIDER_USERNAME]));
        if (await this.runtime.redis.exists('op:cooldown:' + scope)) throw new RegistrarError('PROVIDER_RATE_LIMIT');
        for (let attempt = 0; attempt < 3; attempt++) {
            const count = Number(await this.runtime.redis.eval("local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],60) end;return n", 1, 'op:rate:' + scope));
            if (count > e.OPENPROVIDER_REQUESTS_PER_MINUTE) throw new RegistrarError('PROVIDER_RATE_LIMIT');
            if (login) {
                const logins = Number(await this.runtime.redis.eval("local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],60) end;return n", 1, 'op:login-rate:' + scope));
                if (logins > 30) throw new RegistrarError('PROVIDER_RATE_LIMIT');
            }
            const started = Date.now();
            let diagnostic: RegistrarDiagnostic = {operation};
            try {
                const response = await fetch(e.OPENPROVIDER_BASE_URL + path, {
                    method,
                    redirect: 'error',
                    signal: AbortSignal.timeout(e.OPENPROVIDER_TIMEOUT_MS),
                    headers: {'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})}, ...(body ? {body: JSON.stringify(body)} : {})
                });
                diagnostic = {operation, httpStatus: response.status};
                const raw = await response.text();
                if (raw.length > 2000000) throw new RegistrarError('PROVIDER_INVALID_RESPONSE', false, {
                    ...diagnostic,
                    category: 'response'
                });
                let envelope;
                try {
                    envelope = envelopeSchema.safeParse(parseExactJson(raw));
                } catch {
                    envelope = null;
                }
                const parsed = envelope?.success ? envelope.data : undefined;
                diagnostic = {...diagnostic, ...(parsed ? {providerCode: parsed.code} : {})};
                const failure = classifyOpenproviderFailure(response.status, parsed?.code, login, Boolean(token), parsed?.maintenance);
                if (failure) {
                    if (failure.code === 'PROVIDER_RATE_LIMIT') {
                        const retry = response.headers.get('retry-after');
                        const seconds = retry && /^\d+$/.test(retry) ? Math.min(1200, Math.max(1, Number(retry))) : parsed?.code === 4007 ? 300 : 60;
                        await this.runtime.redis.set('op:cooldown:' + scope, '1', 'EX', seconds);
                    }
                    // A successful HTTP response with an invalid envelope is a contract failure.
                    if (!parsed && response.ok) throw new RegistrarError('PROVIDER_INVALID_RESPONSE', false, {
                        ...diagnostic,
                        category: 'response'
                    });
                    throw new RegistrarError(failure.code, failure.transient, {...failure.diagnostic, operation});
                }
                if (!parsed) throw new RegistrarError('PROVIDER_INVALID_RESPONSE', false, {
                    ...diagnostic,
                    category: 'response'
                });
                this.runtime.logger.info({
                    event: 'registrar.request',
                    provider: 'openprovider',
                    operation,
                    method,
                    httpStatus: response.status,
                    providerCode: parsed.code,
                    attempt: attempt + 1,
                    durationMs: Date.now() - started
                });
                return parsed.data;
            } catch (error) {
                const failure = error instanceof RegistrarError ? error : new RegistrarError(error instanceof Error && error.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE', true, {
                    ...diagnostic,
                    category: 'transient'
                });
                this.runtime.logger.warn({
                    event: 'registrar.error',
                    provider: 'openprovider', ...failure.diagnostic,
                    operation,
                    method,
                    code: failure.code,
                    attempt: attempt + 1,
                    willRetry: failure.transient && attempt < 2,
                    durationMs: Date.now() - started
                });
                if (!failure.transient || attempt === 2) throw failure;
                await delay(100 * 2 ** attempt);
            }
        }
        throw new RegistrarError('PROVIDER_UNAVAILABLE');
    }
}
