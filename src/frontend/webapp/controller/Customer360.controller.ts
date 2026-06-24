import BaseController from "./BaseController";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";

/**
 * @namespace com.yiqian.customer360.controller
 */
export default class Customer360 extends BaseController {
	private pendingCustomerId: string | null = null;

	public onInit(): void {
		this.getRouter().getRoute("customer360")?.attachPatternMatched((event: Event) => {
			const args = event.getParameter("arguments") as { customerId: string };
			this._loadCustomer(args.customerId);
		}, this);
	}

	private _loadCustomer(customerId: string): void {
		// Try immediately
		if (this._trySetCustomer(customerId)) return;

		// App model not ready yet — store and retry via interval
		this.pendingCustomerId = customerId;
		const interval = setInterval(() => {
			if (this._trySetCustomer(this.pendingCustomerId ?? "")) {
				clearInterval(interval);
				this.pendingCustomerId = null;
			}
		}, 100);
		// Stop after 3 seconds
		setTimeout(() => clearInterval(interval), 3000);
	}

	private _trySetCustomer(customerId: string): boolean {
		const appModel = this.getOwnerComponent().getModel("app") as JSONModel | undefined;
		if (!appModel) return false;
		const customers = appModel.getProperty("/customers") as Array<Record<string, unknown>> | undefined;
		if (!customers) return false;
		const customer = customers.find((c) => c["id"] === customerId);
		if (customer) {
			this.getView()?.setModel(new JSONModel(customer), "customer");
			return true;
		}
		return false;
	}

	public onNavBack(): void {
		this.getRouter().navTo("launchpad");
	}

	public onBadgePress(event: Event): void {
		const source = event.getSource() as sap.m.ObjectStatus;
		MessageToast.show(`${source.getTitle()}: ${source.getText()}`);
	}

	public onExpandFinance(): void {
		MessageToast.show("跳转至财务详情页 (F4663 Order to Cash Dashboard)");
	}

	public onViewOrders(): void {
		MessageToast.show("查看全部订单记录");
	}

	public onViewContracts(): void {
		MessageToast.show("查看合约详情");
	}
}
