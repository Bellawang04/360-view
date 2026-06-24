import BaseController from "./BaseController";
import Router from "sap/m/routing/Router";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import VBox from "sap/m/VBox";

/**
 * @namespace com.yiqian.customer360.controller
 */
export default class Launchpad extends BaseController {
	public onInit(): void {
		// App model already loaded via manifest
	}

	public onRoleChange(event: Event): void {
		const selectedKey = (event.getParameter("key") as string);
		const salesView = this.byId("salesView") as VBox;
		const financeView = this.byId("financeView") as VBox;
		const mgmtView = this.byId("mgmtView") as VBox;

		if (salesView) salesView.setVisible(selectedKey === "sales");
		if (financeView) financeView.setVisible(selectedKey === "finance");
		if (mgmtView) mgmtView.setVisible(selectedKey === "mgmt");
	}

	public onTilePress(event: Event): void {
		const source = event.getSource() as sap.m.GenericTile;
		const header = source.getHeader();
		// Navigate to customer list with filter
		this.getRouter().navTo("customerList");
	}

	public onCustomerPress(event: Event): void {
		// itemPress: source = List, parameter "listItem" = the clicked item
		const listItem = (event.getParameter("listItem") ?? event.getSource()) as sap.m.ListItemBase;
		const context = listItem.getBindingContext("app");
		if (context) {
			const customerId = context.getProperty("id") as string;
			if (customerId) {
				this.getRouter().navTo("customer360", { customerId });
			}
		}
	}

	public onViewAllCustomers(): void {
		this.getRouter().navTo("customerList");
	}

	public onSearch(event: Event): void {
		const query = event.getParameter("query") as string;
		MessageToast.show(`搜索: ${query}`);
	}

	public onNotifications(): void {
		MessageToast.show("8 条新预警通知");
	}

	public onToggleView(): void {
		MessageToast.show("切换视图");
	}

	public onProfile(): void {
		MessageToast.show("销售代表: 张伟 · CN01");
	}
}
