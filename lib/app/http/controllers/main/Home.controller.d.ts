import { Controller, Session } from '@extollo/lib';
import { Locale } from "@extollo/i18n";
export declare class Home extends Controller {
    protected readonly session: Session;
    protected readonly locale: Locale;
    welcome(): import("@extollo/lib").ViewResponseFactory;
}
