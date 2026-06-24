import BaseController from "./BaseController";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/m/Table";
import Button from "sap/m/Button";

/**
 * @namespace com.yiqian.customer360.controller
 */
export default class CustomerList extends BaseController {
	public onInit(): void {
		const router = this.getRouter();
		router.getRoute("customerList")?.attachPatternMatched(this._onRouteMatched, this);
	}

	private _onRouteMatched(): void {
		// Reset filter on nav
		this._applyFilter("all");
	}

	public onNavBack(): void {
		this.getRouter().navTo("launchpad");
	}

	public onFilter(event: Event): void {
		const source = event.getSource() as Button;
		const customData = source.getCustomData();
		let filterKey = "all";
		customData.forEach((data) => {
			if (data.getKey() === "filter") {
				filterKey = data.getValue() as string;
			}
		});

		// Update button styles
		const filterButtons = ["全部", "高风险", "合约到期", "RFM D级", "长期未活跃"];
		void filterButtons;

		this._applyFilter(filterKey);
	}

	private _applyFilter(filterKey: string): void {
		const table = this.byId("customerTable") as Table;
		if (!table) return;

		const binding = table.getBinding("items");
		if (!binding) return;

		let filters: Filter[] = [];

		switch (filterKey) {
			case "highRisk":
				filters = [new Filter("rfmTier", FilterOperator.EQ, "D")];
				break;
			case "contractExpiry":
				filters = [new Filter("contractDays", FilterOperator.LE, 30)];
				break;
			case "rfmD":
				filters = [new Filter("rfmTier", FilterOperator.EQ, "D")];
				break;
			case "inactive":
				filters = [new Filter("daysInactive", FilterOperator.GE, 60)];
				break;
			default:
				filters = [];
		}

		(binding as sap.ui.model.ListBinding).filter(filters);
	}

	public onCustomerPress(event: Event): void {
		// Table itemPress: source=Table, listItem param = row; Button press: source=Button
		const listItem = (event.getParameter("listItem") ?? event.getSource()) as sap.m.ListItemBase;
		const context = listItem.getBindingContext("app");
		if (context) {
			const customerId = context.getProperty("id") as string;
			if (customerId) {
				this.getRouter().navTo("customer360", { customerId });
				return;
			}
		}
		// Fallback: customData on source
		const source = event.getSource() as sap.m.Button;
		const customData = source.getCustomData?.() ?? [];
		let customerId = "";
		customData.forEach((data) => {
			if (data.getKey() === "customerId") customerId = data.getValue() as string;
		});
		if (customerId) {
			this.getRouter().navTo("customer360", { customerId });
		}
	}

	public onExport(): void {
		MessageToast.show("导出为 Excel（包含：客户名称、编号、销售额、AR状态、信贷占用率、RFM等级、最近下单日期）");
	}

	public onSort(): void {
		MessageToast.show("排序选项：销售额 / AR逾期额 / RFM评分");
	}
}
