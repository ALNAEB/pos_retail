odoo.define('pos_retail.indexedDB', function (require) {
    "use strict";
    var core = require('web.core');
    var _t = core._t;

    var indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB || window.shimIndexedDB;

    if (!indexedDB) {
        window.alert("Your browser doesn't support a stable version of IndexedDB.")
    }

    var multi_database = {
        init: function (table_name, sequence) {
            var status = new $.Deferred();
            this.pos = this.pos || self.posmodel;
            var request = indexedDB.open(this.pos.session.db + '_' + sequence, 1);
            request.onerror = function (ev) {
                status.reject(ev);
            };
            request.onupgradeneeded = function (ev) {
                var db = ev.target.result;
                db.createObjectStore('product.pricelist.item', {keyPath: "id"});
                db.createObjectStore('product.product', {keyPath: "id"});
                db.createObjectStore('res.partner', {keyPath: "id"});
                db.createObjectStore('account.invoice', {keyPath: "id"});
                db.createObjectStore('account.invoice.line', {keyPath: "id"});
                db.createObjectStore('pos.category', {keyPath: "id"});
                db.createObjectStore('pos.order', {keyPath: "id"});
                db.createObjectStore('pos.order.line', {keyPath: "id"});
                db.createObjectStore('sale.order', {keyPath: "id"});
                db.createObjectStore('sale.order.line', {keyPath: "id"});
            };
            request.onsuccess = function (ev) {
                var db = ev.target.result;
                var transaction = db.transaction([table_name], "readwrite");
                transaction.oncomplete = function () {
                    db.close();
                };
                if (!transaction) {
                    status.reject(new Error('Cannot create transaction with ' + table_name));
                }
                var store = transaction.objectStore(table_name);
                if (!store) {
                    status.reject(new Error('Cannot get object store with ' + table_name));
                }
                status.resolve(store);
            };
            return status.promise();
        },
        write: function (table_name, items) {
            var max_id = items[items.length - 1]['id'];
            var sequence = Math.floor(max_id / 100000);
            console.log('Caching : ' + table_name + ' to table index: ' + sequence + ' with MAX ID: ' + max_id);
            $.when(this.init(table_name, sequence)).done(function (store) {
                _.each(items, function (item) {
                    var request = store.put(item);
                    request.onerror = function (e) {
                        console.warn(e)
                    };
                });
            }).fail(function (error) {
                console.log(error);
            });
        },
        unlink: function (table_name, item) {
            var sequence = Math.floor(item['id'] / 100000);
            $.when(this.init(table_name, sequence)).done(function (store) {
                console.log('Deleted record id: ' + item['id'] + ' of table ' + table_name);
                store.delete(item.id).onerror = function (e) {
                    console.warn(e);
                };
            }).fail(function (error) {
                console.warn(error);
            });
        },
        search_read: function (table_name, sequence) {
            var status = new $.Deferred();
            $.when(this.init(table_name, sequence)).done(function (store) {
                var request = store.getAll();
                request.onsuccess = function (ev) {
                    var items = ev.target.result || [];
                    status.resolve(items);
                };
                request.onerror = function (error) {
                    status.reject(error);
                };
            }).fail(function (error) {
                status.reject(error);
            });
            return status.promise();
        },
        get_pricelist_items: function (pos, max_sequence) {
            this.pos = pos;
            var self = this;
            var done = new $.Deferred();
            function load_data(sequence) {
                if (sequence > max_sequence) {
                    done.resolve();
                } else {
                    $.when(self.search_read('product.pricelist.item', sequence)).then(function (results) {
                        if (!self.pos.database || self.pos.database == null || self.pos.database == undefined) {
                            self.pos.database = {}
                        }
                        if (!self.pos.database['product.pricelist.item']) {
                            self.pos.database['product.pricelist.item'] = results;
                        } else {
                            self.pos.database['product.pricelist.item'] = self.pos.database['product.pricelist.item'].concat(results);
                        }
                    });
                    sequence += 1;
                    load_data(sequence);
                }
            }
            load_data(0);
            return done.promise();
        },
        get_products: function (pos, max_sequence) {
            this.pos = pos;
            var self = this;
            var done = new $.Deferred();
            function load_data(sequence) {
                if (sequence < max_sequence) {
                    $.when(self.search_read('product.product', sequence)).then(function (products) {
                        if (products.length > 0) {
                            self.pos.total_products += products.length;
                            var min_id = products[products.length - 1]['id'];
                            var max_id = pos.model_ids['product.product']['max_id'];
                            self.pos.indexed_database = true;
                            self.pos.chrome.loading_message(_t('Restoring products'), self.pos.get_process_time(min_id, max_id));
                            console.log('Restored products total rows : ' + self.pos.total_products);
                            if (min_id < 100000) {
                                self.pos.set_quantity_available(products);
                                self.pos.database['product.product'] = products;
                            } else {
                                for (var i = 0; i < products.length; i++) {
                                    var product = products[i];
                                    if (product.barcode) {
                                        self.pos.db[product.barcode] = product.id
                                    }
                                    self.pos.db.product_by_id[product.id];
                                }
                            }
                            self.pos.set_last_write_date(products)
                        }
                    });
                    sequence += 1;
                    load_data(sequence);
                }
            }
            load_data(0);
            return done.promise();
        },
        get_clients: function (pos, max_sequence) {
            this.pos = pos;
            var self = this;
            var done = new $.Deferred();

            function load_data(sequence) {
                if (sequence > max_sequence) {
                    done.resolve();
                } else {
                    $.when(self.search_read('res.partner', sequence)).then(function (results) {
                        if (results.length > 0) {
                            self.pos.total_customers += results.length;
                            var min_id = results[results.length - 1]['id'];
                            var max_id = pos.model_ids['res.partner']['max_id'];
                            self.pos.indexed_database = true;
                            self.pos.chrome.loading_message(_t('Restoring partners'), self.pos.get_process_time(min_id, max_id));
                            self.pos.save_results('res.partner', results)
                        }
                    });
                    sequence += 1;
                    load_data(sequence);
                }
            }
            load_data(0);
            return done.promise();
        },
        get_invoices: function (pos, max_sequence) {
            this.pos = pos;
            var self = this;
            var done = new $.Deferred();

            function load_data(sequence) {
                if (sequence > max_sequence) {
                    done.resolve();
                } else {
                    $.when(self.search_read('account.invoice', sequence)).then(function (results) {
                        if (results.length > 0) {
                            self.pos.save_results('account.invoice', results)
                        }
                    });
                    sequence += 1;
                    load_data(sequence);
                }
            }
            load_data(0);
            return done.promise();
        },
        get_invoice_lines: function (pos, max_sequence) {
            this.pos = pos;
            var self = this;
            var done = new $.Deferred();

            function load_data(sequence) {
                if (sequence > max_sequence) {
                    done.resolve();
                } else {
                    $.when(self.search_read('account.invoice.line', sequence)).then(function (results) {
                        if (results.length > 0) {
                            self.pos.save_results('account.invoice.line', results)
                        }
                    });
                    sequence += 1;
                    load_data(sequence);
                }
            }
            load_data(0);
            return done.promise();
        },
        get_pos_orders: function (pos, max_sequence) {
            this.pos = pos;
            var self = this;
            var done = new $.Deferred();

            function load_data(sequence) {
                if (sequence > max_sequence) {
                    done.resolve();
                } else {
                    $.when(self.search_read('pos.order', sequence)).then(function (results) {
                        if (results.length > 0) {
                            self.pos.save_results('pos.order', results)
                        }
                    });
                    sequence += 1;
                    load_data(sequence);
                }
            }
            load_data(0);
            return done.promise();
        },
        get_pos_order_lines: function (pos, max_sequence) {
            this.pos = pos;
            var self = this;
            var done = new $.Deferred();

            function load_data(sequence) {
                if (sequence > max_sequence) {
                    done.resolve();
                } else {
                    $.when(self.search_read('pos.order.line', sequence)).then(function (results) {
                        if (results.length > 0) {
                            self.pos.save_results('pos.order.line', results)
                        }
                    });
                    sequence += 1;
                    load_data(sequence);
                }
            }
            load_data(0);
            return done.promise();
        },
        get_sale_orders: function (pos, max_sequence) {
            this.pos = pos;
            var self = this;
            var done = new $.Deferred();

            function load_data(sequence) {
                if (sequence > max_sequence) {
                    done.resolve();
                } else {
                    $.when(self.search_read('sale.order', sequence)).then(function (results) {
                        if (results.length > 0) {
                            self.pos.save_results('sale.order', results)
                        }
                    });
                    sequence += 1;
                    load_data(sequence);
                }
            }
            load_data(0);
            return done.promise();
        },
        get_sale_order_lines: function (pos, max_sequence) {
            this.pos = pos;
            var self = this;
            var done = new $.Deferred();

            function load_data(sequence) {
                if (sequence > max_sequence) {
                    done.resolve();
                } else {
                    $.when(self.search_read('sale.order.line', sequence)).then(function (results) {
                        if (results.length > 0) {
                            self.pos.save_results('sale.order.line', results)
                        }
                    });
                    sequence += 1;
                    load_data(sequence);
                }
            }
            load_data(0);
            return done.promise();
        }
    };
    return multi_database;
});
