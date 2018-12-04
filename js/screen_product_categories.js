"use strict";
odoo.define('pos_retail.screen_product_categories', function (require) {
    var screens = require('point_of_sale.screens');
    screens.ProductCategoriesWidget.include({
        init: function(parent, options) {
            var self = this;
            this._super(parent,options);
            this.pos.bind('update:categories', function () {
                this.renderElement();
            }, this);
        },
    })
});