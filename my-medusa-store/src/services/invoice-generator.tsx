import React from 'react';

// Format currency helper
const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency.toUpperCase() }).format(amount);
}

export const generateInvoice = async (order: any) => {
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

  const InvoiceDocument = ({ order }: { order: any }) => (
    <Document>
        <Page size="A4" style={styles.page}>
        
        {/* Header */}
        <View style={styles.header}>
            <Text style={styles.title}>INVOICE</Text>
            <View style={styles.row}>
            <Text style={styles.label}>Order ID:</Text>
            <Text style={styles.value}>#{order.display_id}</Text>
            </View>
            <View style={styles.row}>
                <Text style={styles.label}>Date:</Text>
                <Text style={styles.value}>{new Date().toLocaleDateString()}</Text>
            </View>
        </View>

        {/* Customer Details */}
        <View style={styles.section}>
            <Text style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 5 }}>Bill To:</Text>
            <Text style={styles.value}>
                {order.billing_address?.first_name} {order.billing_address?.last_name}
            </Text>
            <Text style={styles.value}>{order.billing_address?.address_1}</Text>
            <Text style={styles.value}>{order.billing_address?.city}, {order.billing_address?.postal_code}</Text>
            <Text style={styles.value}>{order.email}</Text>
        </View>

        {/* Items Table */}
        <View style={styles.section}>
            <View style={styles.tableHeader}>
                <Text style={[styles.label, styles.colProduct]}>Product</Text>
                <Text style={[styles.label, styles.colQty]}>Qty</Text>
                <Text style={[styles.label, styles.colPrice]}>Price</Text>
                <Text style={[styles.label, styles.colTotal]}>Total</Text>
            </View>
            {order.items?.map((item: any) => (
                <View key={item.id} style={styles.tableRow}>
                    <Text style={[styles.value, styles.colProduct]}>{item.title}</Text>
                    <Text style={[styles.value, styles.colQty]}>{item.quantity}</Text>
                    <Text style={[styles.value, styles.colPrice]}>{formatCurrency(item.unit_price, order.currency_code)}</Text>
                    <Text style={[styles.value, styles.colTotal]}>{formatCurrency(item.unit_price * item.quantity, order.currency_code)}</Text>
                </View>
            ))}
        </View>

        {/* Totals */}
        <View style={styles.totalSection}>
            <View style={{ width: '50%' }}>
                <View style={styles.row}>
                    <Text style={styles.label}>Subtotal:</Text>
                    <Text style={styles.value}>{formatCurrency(order.subtotal, order.currency_code)}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={{ ...styles.label, fontWeight: 'bold', fontSize: 12 }}>Total:</Text>
                    <Text style={{ ...styles.value, fontWeight: 'bold', fontSize: 12 }}>{formatCurrency(order.total, order.currency_code)}</Text>
                </View>
            </View>
        </View>

        </Page>
    </Document>
  );

  return await renderToBuffer(<InvoiceDocument order={order} />);
};
