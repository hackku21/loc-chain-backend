import {Controller, view, Session} from '@extollo/lib';
import {Inject, Injectable} from "@extollo/di";
import {Locale} from "@extollo/i18n"

@Injectable()
export class Home extends Controller {
    @Inject()
    protected readonly session!: Session;

    @Inject()
    protected readonly locale!: Locale;

    public welcome() {
        this.session.set('app_visits', this.session.get('app_visits', 0) + 1)

        return view('welcome', {
            app_visits: this.session.get('app_visits'),
            locale: this.locale.helper(),
        })
    }
}
