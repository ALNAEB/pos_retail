odoo.define('pos_retail.pos_backend', function (require) {
    "use strict";

    var WebClient = require('web.WebClient');
    var core = require('web.core');
    var _t = core._t;

    var indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB || window.shimIndexedDB;

    if (!indexedDB) {
        window.alert("Your browser doesn't support a stable version of IndexedDB.")
    }

    WebClient.include({
        remove_indexed_db: function (notifications) {
            var dbName = JSON.parse(notifications).db;
            for (var i=0; i <= 50; i ++) {
                indexedDB.deleteDatabase(dbName + '_' + i);
            }
            this.do_notify(_t('POS database deleted'),
                        _t('We start pos session for installing again now'));
        },
        show_application: function () {
            this.call('bus_service', 'onNotification', this, function (notifications) { // v12 dont merge
                _.each(notifications, (function (notification) {
                    if (notification[0][1] === 'pos.indexed_db') {
                        this.remove_indexed_db(notification[1]);
                    }
                }).bind(this));
            });
            return this._super.apply(this, arguments);
        }
    });

});
