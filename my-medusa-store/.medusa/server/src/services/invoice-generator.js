"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateInvoice = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
// Format currency helper
const formatCurrency = (amount, currency) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency.toUpperCase() }).format(amount);
};
const generateInvoice = async (order) => {
    // Dynamic import to handle ESM module in CJS environment
    const { renderToBuffer, Document, Page, Text, View, StyleSheet } = await import('@react-pdf/renderer');
    // Define styles for the PDF
    const styles = StyleSheet.create({
        page: {
            flexDirection: 'column',
            backgroundColor: '#FFFFFF',
            padding: 30,
            fontFamily: 'Helvetica',
        },
        header: {
            marginBottom: 20,
            borderBottomWidth: 1,
            borderBottomColor: '#EEEEEE',
            paddingBottom: 10,
        },
        title: {
            fontSize: 24,
            fontWeight: 'bold',
            marginBottom: 10,
        },
        row: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 5,
        },
        label: {
            fontSize: 10,
            color: '#666666',
        },
        value: {
            fontSize: 10,
            color: '#000000',
        },
        section: {
            margin: 10,
            padding: 10,
        },
        tableHeader: {
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: '#000000',
            paddingBottom: 5,
            marginBottom: 5,
        },
        tableRow: {
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: '#EEEEEE',
            paddingVertical: 5,
        },
        colProduct: { width: '50%' },
        colQty: { width: '15%', textAlign: 'center' },
        colPrice: { width: '15%', textAlign: 'right' },
        colTotal: { width: '20%', textAlign: 'right' },
        totalSection: {
            marginTop: 20,
            alignItems: 'flex-end',
        },
    });
    const InvoiceDocument = ({ order }) => ((0, jsx_runtime_1.jsx)(Document, { children: (0, jsx_runtime_1.jsxs)(Page, { size: "A4", style: styles.page, children: [(0, jsx_runtime_1.jsxs)(View, { style: styles.header, children: [(0, jsx_runtime_1.jsx)(Text, { style: styles.title, children: "INVOICE" }), (0, jsx_runtime_1.jsxs)(View, { style: styles.row, children: [(0, jsx_runtime_1.jsx)(Text, { style: styles.label, children: "Order ID:" }), (0, jsx_runtime_1.jsxs)(Text, { style: styles.value, children: ["#", order.display_id] })] }), (0, jsx_runtime_1.jsxs)(View, { style: styles.row, children: [(0, jsx_runtime_1.jsx)(Text, { style: styles.label, children: "Date:" }), (0, jsx_runtime_1.jsx)(Text, { style: styles.value, children: new Date().toLocaleDateString() })] })] }), (0, jsx_runtime_1.jsxs)(View, { style: styles.section, children: [(0, jsx_runtime_1.jsx)(Text, { style: { fontSize: 12, fontWeight: 'bold', marginBottom: 5 }, children: "Bill To:" }), (0, jsx_runtime_1.jsxs)(Text, { style: styles.value, children: [order.billing_address?.first_name, " ", order.billing_address?.last_name] }), (0, jsx_runtime_1.jsx)(Text, { style: styles.value, children: order.billing_address?.address_1 }), (0, jsx_runtime_1.jsxs)(Text, { style: styles.value, children: [order.billing_address?.city, ", ", order.billing_address?.postal_code] }), (0, jsx_runtime_1.jsx)(Text, { style: styles.value, children: order.email })] }), (0, jsx_runtime_1.jsxs)(View, { style: styles.section, children: [(0, jsx_runtime_1.jsxs)(View, { style: styles.tableHeader, children: [(0, jsx_runtime_1.jsx)(Text, { style: [styles.label, styles.colProduct], children: "Product" }), (0, jsx_runtime_1.jsx)(Text, { style: [styles.label, styles.colQty], children: "Qty" }), (0, jsx_runtime_1.jsx)(Text, { style: [styles.label, styles.colPrice], children: "Price" }), (0, jsx_runtime_1.jsx)(Text, { style: [styles.label, styles.colTotal], children: "Total" })] }), order.items?.map((item) => ((0, jsx_runtime_1.jsxs)(View, { style: styles.tableRow, children: [(0, jsx_runtime_1.jsx)(Text, { style: [styles.value, styles.colProduct], children: item.title }), (0, jsx_runtime_1.jsx)(Text, { style: [styles.value, styles.colQty], children: item.quantity }), (0, jsx_runtime_1.jsx)(Text, { style: [styles.value, styles.colPrice], children: formatCurrency(item.unit_price, order.currency_code) }), (0, jsx_runtime_1.jsx)(Text, { style: [styles.value, styles.colTotal], children: formatCurrency(item.unit_price * item.quantity, order.currency_code) })] }, item.id)))] }), (0, jsx_runtime_1.jsx)(View, { style: styles.totalSection, children: (0, jsx_runtime_1.jsxs)(View, { style: { width: '50%' }, children: [(0, jsx_runtime_1.jsxs)(View, { style: styles.row, children: [(0, jsx_runtime_1.jsx)(Text, { style: styles.label, children: "Subtotal:" }), (0, jsx_runtime_1.jsx)(Text, { style: styles.value, children: formatCurrency(order.subtotal, order.currency_code) })] }), (0, jsx_runtime_1.jsxs)(View, { style: styles.row, children: [(0, jsx_runtime_1.jsx)(Text, { style: { ...styles.label, fontWeight: 'bold', fontSize: 12 }, children: "Total:" }), (0, jsx_runtime_1.jsx)(Text, { style: { ...styles.value, fontWeight: 'bold', fontSize: 12 }, children: formatCurrency(order.total, order.currency_code) })] })] }) })] }) }));
    return await renderToBuffer((0, jsx_runtime_1.jsx)(InvoiceDocument, { order: order }));
};
exports.generateInvoice = generateInvoice;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW52b2ljZS1nZW5lcmF0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvc2VydmljZXMvaW52b2ljZS1nZW5lcmF0b3IudHN4Il0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7QUFFQSx5QkFBeUI7QUFDekIsTUFBTSxjQUFjLEdBQUcsQ0FBQyxNQUFjLEVBQUUsUUFBZ0IsRUFBRSxFQUFFO0lBQ3hELE9BQU8sSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ2xILENBQUMsQ0FBQTtBQUVNLE1BQU0sZUFBZSxHQUFHLEtBQUssRUFBRSxLQUFVLEVBQUUsRUFBRTtJQUNsRCx5REFBeUQ7SUFDekQsTUFBTSxFQUFFLGNBQWMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEdBQUcsTUFBTSxNQUFNLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUV2Ryw0QkFBNEI7SUFDNUIsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQztRQUMvQixJQUFJLEVBQUU7WUFDRixhQUFhLEVBQUUsUUFBUTtZQUN2QixlQUFlLEVBQUUsU0FBUztZQUMxQixPQUFPLEVBQUUsRUFBRTtZQUNYLFVBQVUsRUFBRSxXQUFXO1NBQzFCO1FBQ0QsTUFBTSxFQUFFO1lBQ0osWUFBWSxFQUFFLEVBQUU7WUFDaEIsaUJBQWlCLEVBQUUsQ0FBQztZQUNwQixpQkFBaUIsRUFBRSxTQUFTO1lBQzVCLGFBQWEsRUFBRSxFQUFFO1NBQ3BCO1FBQ0QsS0FBSyxFQUFFO1lBQ0gsUUFBUSxFQUFFLEVBQUU7WUFDWixVQUFVLEVBQUUsTUFBTTtZQUNsQixZQUFZLEVBQUUsRUFBRTtTQUNuQjtRQUNELEdBQUcsRUFB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