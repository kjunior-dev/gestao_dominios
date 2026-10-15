import {
  Inject,
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@devtrust/database';
import { CartView } from '@devtrust/contracts';
import { DatabaseService } from '../../common/database.service';
import { RuntimeService } from '../../common/runtime.service';
import { AuthRequest } from '../../common/security';
import { digest, equalHash, randomToken } from '../../common/crypto';
import { DomainsService } from '../domains/domains.service';
export const cartCookie = (production: boolean) =>
  production ? '__Host-dt_cart' : 'dt_cart';
@Injectable()
export class CartService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(RuntimeService) private runtime: RuntimeService,
    @Inject(DomainsService) private domains: DomainsService,
  ) {}
  private options() {
    return {
      secure: this.runtime.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: this.runtime.env.CART_TTL_HOURS * 3600000,
    };
  }
  private get expires() {
    return new Date(Date.now() + this.runtime.env.CART_TTL_HOURS * 3600000);
  }
  private guestToken(req: AuthRequest) {
    const token =
      req.cookies?.[cartCookie(this.runtime.env.NODE_ENV === 'production')];
    return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
      ? token
      : null;
  }
  async merge(req: AuthRequest, userId: string, res?: Response) {
    const token = this.guestToken(req);
    if (!token) return;
    await this.db.$transaction(async (tx) => {
      const guestScope = 'guest:' + digest(token);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${guestScope},0))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId},0))`;
      const guest = await tx.cart.findUnique({
        where: { sessionIdentifier: digest(token) },
        include: { items: true },
      });
      if (!guest || guest.status !== 'OPEN' || guest.expiresAt <= new Date())
        return;
      const target = await tx.cart.upsert({
        where: { userId },
        create: { userId, expiresAt: this.expires },
        update: {},
      });
      if (target.expiresAt <= new Date() || target.status !== 'OPEN') {
        await tx.cartItem.deleteMany({ where: { cartId: target.id } });
        await tx.cart.update({
          where: { id: target.id },
          data: { status: 'OPEN', expiresAt: this.expires },
        });
      }
      for (const item of guest.items) {
        const data = {
          domainName: item.domainName,
          tldId: item.tldId,
          registrarCode: item.registrarCode,
          operation: item.operation,
          registrationYears: item.registrationYears,
          unitPriceMinor: item.unitPriceMinor,
          currency: item.currency,
          isPremium: item.isPremium,
          quoteExpiresAt: item.quoteExpiresAt,
          priceSnapshot: item.priceSnapshot,
        };
        await tx.cartItem.upsert({
          where: {
            cartId_domainName_operation: {
              cartId: target.id,
              domainName: item.domainName,
              operation: item.operation,
            },
          },
          create: {
            ...data,
            priceSnapshot: data.priceSnapshot as Prisma.InputJsonValue,
            cartId: target.id,
          },
          update: {},
        });
      }
      await tx.cartItem.deleteMany({ where: { cartId: guest.id } });
      await tx.cart.update({
        where: { id: guest.id },
        data: { status: 'MERGED' },
      });
    });
    if (res) {
      res.clearCookie(
        cartCookie(this.runtime.env.NODE_ENV === 'production'),
        this.options(),
      );
      res.clearCookie('dt_cart_csrf', this.options());
    }
  }
  async resolve(req: AuthRequest, res?: Response, mutation = false) {
    if (req.user) {
      if (!mutation) await this.merge(req, req.user.id, res);
      const cart = await this.db.cart.upsert({
        where: { userId: req.user.id },
        create: { userId: req.user.id, expiresAt: this.expires },
        update: {},
      });
      return this.active(cart.id, mutation);
    }
    const token = this.guestToken(req);
    let cart = token
      ? await this.db.cart.findUnique({
          where: { sessionIdentifier: digest(token) },
        })
      : null;
    if (cart && cart.status !== 'OPEN') cart = null;
    if (mutation) {
      const csrf = req.headers['x-cart-csrf-token'];
      if (
        !cart ||
        !cart.csrfHash ||
        typeof csrf !== 'string' ||
        !equalHash(csrf, cart.csrfHash)
      )
        throw new ForbiddenException(
          'Inicialize o carrinho e confirme a proteção CSRF',
        );
      return this.active(cart.id, true);
    }
    if (!cart || cart.expiresAt <= new Date()) {
      if (cart)
        await this.db.cart.update({
          where: { id: cart.id },
          data: { status: 'EXPIRED' },
        });
      const fresh = randomToken(),
        csrf = randomToken();
      cart = await this.db.cart.create({
        data: {
          sessionIdentifier: digest(fresh),
          csrfHash: digest(csrf),
          expiresAt: this.expires,
        },
      });
      res?.cookie(
        cartCookie(this.runtime.env.NODE_ENV === 'production'),
        fresh,
        { ...this.options(), httpOnly: true },
      );
      res?.cookie('dt_cart_csrf', csrf, { ...this.options(), httpOnly: false });
    }
    return cart;
  }
  private async active(id: string, mutation: boolean) {
    const cart = await this.db.cart.findUniqueOrThrow({ where: { id } });
    if (cart.expiresAt > new Date() && cart.status === 'OPEN') return cart;
    if (mutation)
      throw new HttpException(
        'Carrinho expirado. Abra novamente o carrinho.',
        410,
      );
    return this.db.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { cartId: id } });
      return tx.cart.update({
        where: { id },
        data: { status: 'OPEN', expiresAt: this.expires },
      });
    });
  }
  async view(cartId: string): Promise<CartView> {
    const cart = await this.db.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: {
        items: {
          include: {
            tld: { include: { registrars: { include: { registrar: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return {
      id: cart.id,
      currency: cart.currency,
      expiresAt: cart.expiresAt.toISOString(),
      subtotalMinor: cart.items
        .reduce((sum, item) => sum + item.unitPriceMinor, 0n)
        .toString(),
      requiresRevalidation: cart.items.some(
        (i) => i.quoteExpiresAt <= new Date(),
      ),
      items: cart.items.map((i) => {
        const link = i.tld.registrars.find(
          (l) => l.registrar.code === i.registrarCode,
        );
        return {
          id: i.id,
          domainName: i.domainName,
          registrationYears: i.registrationYears,
          unitPriceMinor: i.unitPriceMinor.toString(),
          currency: i.currency,
          isPremium: i.isPremium,
          quoteExpiresAt: i.quoteExpiresAt.toISOString(),
          minimumPeriod: link?.minimumPeriod || 1,
          maximumPeriod: link?.maximumPeriod || 1,
        };
      }),
    };
  }
  async put(
    req: AuthRequest,
    domainName: string,
    registrationYears: number,
    itemId?: string,
  ) {
    const cart = await this.resolve(req, undefined, true);
    if (itemId) {
      const item = await this.db.cartItem.findFirst({
        where: { id: itemId, cartId: cart.id },
      });
      if (!item) throw new NotFoundException('Item não encontrado');
      domainName = item.domainName;
    }
    await this.domains.throttle(req.ip || 'unknown');
    const search = await this.domains.search(
      { query: domainName, registrationYears },
      req.user?.id,
      true,
    );
    const result = search.results[0],
      snapshot = search.snapshots.get(result.domainName);
    if (result.status !== 'AVAILABLE' || !result.quote || !snapshot)
      throw new ConflictException(
        'Disponibilidade ou cotação não confirmada. Pesquise novamente.',
      );
    // Premium prices use the domain-specific quote. No purchase endpoint exists.

    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cart.id},0))`;
      const current = await tx.cart.findUniqueOrThrow({
        where: { id: cart.id },
      });
      if (current.status !== 'OPEN' || current.expiresAt <= new Date())
        throw new ConflictException('Carrinho expirado');
      const count = await tx.cartItem.count({ where: { cartId: cart.id } }),
        existing = await tx.cartItem.findUnique({
          where: {
            cartId_domainName_operation: {
              cartId: cart.id,
              domainName: result.domainName,
              operation: 'REGISTER',
            },
          },
        });
      if (count >= 20 && !existing)
        throw new ConflictException('O carrinho suporta até 20 domínios');
      if (
        itemId &&
        !(await tx.cartItem.findFirst({
          where: { id: itemId, cartId: cart.id },
        }))
      )
        throw new NotFoundException('Item não encontrado');
      const data = {
        tldId: result.tldId,
        registrarCode: result.registrarCode,
        registrationYears,
        unitPriceMinor: BigInt(result.quote!.priceMinor),
        currency: result.quote!.currency,
        isPremium: result.isPremium,
        quoteExpiresAt: new Date(result.quote!.expiresAt),
        priceSnapshot: snapshot as Prisma.InputJsonObject,
      };
      await tx.cartItem.upsert({
        where: {
          cartId_domainName_operation: {
            cartId: cart.id,
            domainName: result.domainName,
            operation: 'REGISTER',
          },
        },
        create: { ...data, cartId: cart.id, domainName: result.domainName },
        update: data,
      });
    });
    return this.view(cart.id);
  }
  async remove(req: AuthRequest, itemId?: string) {
    const cart = await this.resolve(req, undefined, true);
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cart.id},0))`;
      if (itemId) {
        const deleted = await tx.cartItem.deleteMany({
          where: { id: itemId, cartId: cart.id },
        });
        if (!deleted.count) throw new NotFoundException('Item não encontrado');
      } else await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    });
    return this.view(cart.id);
  }
}
