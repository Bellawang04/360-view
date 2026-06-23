export default {
	name: "QUnit test suite for the UI5 Application: com.yiqian.customer360",
	defaults: {
		page: "ui5://test-resources/com/yiqian/customer360/Test.qunit.html?testsuite={suite}&test={name}",
		qunit: {
			version: 2
		},
		sinon: {
			version: 4
		},
		ui5: {
			language: "EN",
			theme: "sap_horizon"
		},
		coverage: {
			only: ["com/yiqian/customer360/"],
			never: ["test-resources/com/yiqian/customer360/"]
		},
		loader: {
			paths: {
				"com/yiqian/customer360": "../"
			}
		}
	},
	tests: {
		"unit/unitTests": {
			title: "Unit tests for com.yiqian.customer360"
		},
		"integration/opaTests": {
			title: "Integration tests for com.yiqian.customer360"
		}
	}
};
