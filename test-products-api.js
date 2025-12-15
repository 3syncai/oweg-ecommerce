// Simple test script to verify the products API endpoint
const testAPI = async () => {
    try {
        console.log('Testing /affiliate/user/products endpoint...\n');

        const response = await fetch('http://localhost:9000/affiliate/user/products', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('❌ API request failed:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('Error details:', errorText);
            return;
        }

        const data = await response.json();

        console.log('✅ API Response Success!\n');
        console.log('Total products:', data.products?.length || 0);
        console.log('Total categories:', data.categories?.length || 0);
        console.log('\nCategories:', data.categories);

        if (data.products && data.products.length > 0) {
            console.log('\n📦 First 3 Products:');
            data.products.slice(0, 3).forEach((product, index) => {
                console.log(`\n${index + 1}. ${product.title}`);
                console.log(`   Price: ₹${product.price.toLocaleString('en-IN')}`);
                console.log(`   Commission Rate: ${product.commissionRate}%`);
                console.log(`   Commission Amount: ₹${product.commissionAmount.toFixed(2)}`);
                console.log(`   Category: ${product.category}`);
                console.log(`   In Stock: ${product.isInStock ? 'Yes' : 'No'}`);
                console.log(`   Inventory: ${product.inventoryQuantity} units`);
            });
        } else {
            console.log('\n⚠️  No products returned');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
};

testAPI();
