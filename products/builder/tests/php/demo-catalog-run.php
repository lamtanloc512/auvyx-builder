<?php
/** Isolated WooCommerce integration checks for demo catalogs: the cloud pack (variable products, cache, integrity, removal) and a local catalog from a folder of `auvyx_builder_demo_catalog_dirs` (a port's child theme). */
require '/wordpress/wp-load.php';

use Auvyx\Builder\Modules\DemoCatalog\DemoCatalog;

function auvyx_catalog_assert( bool $condition, string $message ): void {
	if ( ! $condition ) {
		throw new RuntimeException( $message );
	}
}

function auvyx_catalog_forget( string $id ): void {
	delete_transient( 'auvyx_demo_pack_' . $id );
	delete_transient( 'auvyx_demo_pack_miss_' . $id );
}

$fixtures = AUVYX_BUILDER_DIR . 'tests/fixtures/demo-catalog';
$photo_a  = file_get_contents( $fixtures . '/images/products/red.jpg' );
$photo_b  = file_get_contents( $fixtures . '/images/products/blue.jpg' );
$media   = array(
	'products/test-phone-1.jpg' => $photo_a,
	'products/test-phone-2.jpg' => $photo_b,
	'products/test-case-1.jpg'  => $photo_a,
	'products/test-bad-1.jpg'   => $photo_b,
	'products/test-collide-1.jpg' => $photo_a,
);
$files   = array();
foreach ( $media as $path => $body ) {
	$files[ $path ] = array(
		'sha256' => hash( 'sha256', $body ),
		'bytes'  => strlen( $body ),
	);
}
$files['products/test-bad-1.jpg']['sha256'] = str_repeat( '0', 64 ); // Declared hash does not match the served bytes.
$pack = array(
	'schema'     => 'auvyx-demo-catalog/2',
	'id'         => 'electronics',
	'_auvyx_dir'    => AUVYX_BUILDER_DIR, // a cloud pack never says where photos are on disk: ignored
	'version'    => 1,
	'currency'   => 'USD',
	'categories' => array(
		array(
			'key'    => 'phones',
			'name'   => 'Phones',
			'parent' => null,
		),
		array(
			'key'    => 'gadgets',
			'name'   => 'Gadgets',
			'parent' => null,
		),
	),
	'attributes' => array(
		array(
			'key'    => 'color',
			'label'  => 'Color',
			'kind'   => 'color',
			'values' => array(
				array(
					'key'    => 'black',
					'label'  => 'Black',
					'swatch' => '#111111',
				),
				array(
					'key'    => 'blue',
					'label'  => 'Blue',
					'swatch' => '#2f5fd0',
				),
			),
		),
		array(
			'key'    => 'storage',
			'label'  => 'Storage',
			'kind'   => 'label',
			'values' => array(
				array(
					'key'   => '128',
					'label' => '128 GB',
				),
				array(
					'key'   => '256',
					'label' => '256 GB',
				),
			),
		),
	),
	'products'   => array(
		array(
			'key'        => 'test-phone',
			'name'       => 'Test phone',
			'categories' => array( 'phones' ),
			'price'      => '699',
			'sale'       => '649',
			'excerpt'    => 'A phone.',
			'description' => "First paragraph.\n\nSecond paragraph.",
			'stock'      => 8,
			'media'      => array(
				array(
					'kind' => 'image',
					'src'  => 'products/test-phone-1.jpg',
				),
				array(
					'kind' => 'image',
					'src'  => 'products/test-phone-2.jpg',
				),
			),
			'variants'   => array(
				array(
					'options' => array(
						'color'   => 'black',
						'storage' => '128',
					),
					'stock'   => 5,
					'media'   => array( 'products/test-phone-1.jpg' ),
				),
				array(
					'options' => array(
						'color'   => 'black',
						'storage' => '256',
					),
					'stock'   => 0,
					'price'   => '799',
					'media'   => array( 'products/test-phone-2.jpg' ),
				),
				array(
					'options' => array(
						'storage' => '128',
						'color'   => 'blue',
					),
					'stock'   => 3,
				),
				array(
					'options' => array(
						'color'   => 'pink',
						'storage' => '128',
					),
					'stock'   => 1,
				),
				array(
					'options' => array(
						'color'   => 'black',
						'storage' => '128',
					),
					'stock'   => 9,
				),
			),
		),
		array(
			'key'        => 'test-case',
			'name'       => 'Test case',
			'categories' => array( 'gadgets' ),
			'price'      => '19',
			'sale'       => '15',
			'excerpt'    => 'A case.',
			'description' => 'A case.',
			'stock'      => 7,
			'media'      => array(
				array(
					'kind' => 'image',
					'src'  => 'products/test-case-1.jpg',
				),
			),
			'variants'   => array(),
		),
		array(
			'key'        => 'test-bad',
			'name'       => 'Test bad',
			'categories' => array( 'gadgets' ),
			'price'      => '5',
			'excerpt'    => 'Bad.',
			'description' => 'Bad.',
			'stock'      => 1,
			'media'      => array(
				array(
					'kind' => 'image',
					'src'  => 'products/test-bad-1.jpg',
				),
			),
			'variants'   => array(),
		),
		array(
			'key'        => 'test-collide',
			'name'       => 'Test collide',
			'categories' => array( 'gadgets' ),
			'price'      => '5',
			'excerpt'    => 'Collide.',
			'description' => 'Collide.',
			'stock'      => 1,
			'media'      => array(
				array(
					'kind' => 'image',
					'src'  => 'products/test-collide-1.jpg',
				),
			),
			'variants'   => array(),
		),
	),
	'files'      => $files,
);
$mode     = 'ok';
$packs    = 0;
$requests = 0;
$sent     = array();
$fail     = false;
$padding  = false;
add_filter(
	'pre_http_request',
	static function ( $pre, $args, $url ) use ( &$mode, &$packs, &$requests, &$sent, &$fail, &$padding, $pack, $media ) {
		$ok = static fn( $body, $headers = array() ) => array(
			'headers'  => $headers,
			'body'     => $body,
			'response' => array(
				'code'    => 200,
				'message' => 'OK',
			),
			'cookies'  => array(),
		);
		if ( false !== strpos( $url, '/v1/demo/catalogs/' ) ) {
			++$packs;
			$sent = (array) ( $args['headers'] ?? array() );
			if ( false === strpos( $url, '/electronics' ) ) {
				return $ok( '{}' ) + array( 'response' => array( 'code' => 404, 'message' => 'Not Found' ) );
			}
			if ( 'offline' === $mode ) {
				return new WP_Error( 'auvyx_test_network', 'Offline.' );
			}
			$body = wp_json_encode( $padding ? $pack + array( 'pad' => str_repeat( 'x', DemoCatalog::PACK_LIMIT ) ) : $pack );
			$etag = '"' . ( 'badhash' === $mode ? str_repeat( 'a', 64 ) : hash( 'sha256', $body ) ) . '"';
			if ( 'ok' === $mode && ( $sent['If-None-Match'] ?? '' ) === $etag ) {
				return array(
					'headers'  => array( 'etag' => $etag ),
					'body'     => '',
					'response' => array(
						'code'    => 304,
						'message' => 'Not Modified',
					),
					'cookies'  => array(),
				);
			}
			return $ok( $body, array( 'etag' => $etag ) );
		}
		if ( false === strpos( $url, '/demo-products/' ) ) {
			return new WP_Error( 'auvyx_test_network', 'Network disabled in catalog tests.' );
		}
		++$requests;
		if ( $fail ) {
			return new WP_Error( 'auvyx_test_download', 'Photo download failed.' );
		}
		$path = substr( $url, strpos( $url, '/electronics/' ) + 13 );
		$body = $media[ $path ] ?? $photo_a;
		if ( ! empty( $args['filename'] ) ) {
			file_put_contents( $args['filename'], $body );
		}
		return $ok( $body, array( 'content-type' => 'image/jpeg' ) );
	},
	10,
	3
);

try {
	wp_set_current_user( 1 );
	auvyx_catalog_assert( array() === DemoCatalog::catalog( '../electronics' ), 'Reject traversal.' );
	auvyx_catalog_forget( 'electronics' );
	auvyx_catalog_assert( is_wp_error( DemoCatalog::import( 'electronics', 'unknown' ) ), 'Reject unknown product keys.' );

	// Pre-existing shop data the import must never remove.
	$unrelated = new WC_Product_Simple();
	$unrelated->set_name( 'Unrelated product' );
	$unrelated->set_sku( 'unrelated-1' );
	$unrelated->save();
	$stray = wp_insert_post( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'post_title' => 'Stray' ) );
	wp_insert_term( 'Gadgets', 'product_cat' );
	$storage = wc_create_attribute( array( 'name' => 'Storage', 'slug' => 'storage', 'type' => 'select' ) );
	auvyx_catalog_assert( ! is_wp_error( $storage ), 'Pre-existing attribute.' );
	if ( ! taxonomy_exists( 'pa_storage' ) ) {
		register_taxonomy( 'pa_storage', array( 'product' ), array( 'hierarchical' => false, 'public' => false, 'rewrite' => false ) );
	}
	wp_insert_term( '128 GB', 'pa_storage', array( 'slug' => '128' ) );

	// A failed photo never publishes a blank product, and is retryable.
	$fail = true;
	$bad  = DemoCatalog::import( 'electronics', 'test-case' );
	auvyx_catalog_assert( is_wp_error( $bad ) && 0 === wc_get_product_id_by_sku( 'auvyx-demo-electronics-test-case' ), 'Image failure does not publish blank product.' );
	$fail = false;

	// Variable product from the cloud pack.
	$one = DemoCatalog::import( 'electronics', 'test-phone' );
	auvyx_catalog_assert( ! is_wp_error( $one ), is_wp_error( $one ) ? $one->get_error_message() : 'Import failed.' );
	auvyx_catalog_assert( 1 === $packs, 'One pack request, then cached for the rest of the import.' );
	$product = wc_get_product( $one['id'] );
	auvyx_catalog_assert( $product instanceof WC_Product_Variable && $product->is_purchasable(), 'Native variable product.' );
	auvyx_catalog_assert( 3 === count( $product->get_children() ), 'Only valid, unique variants are created.' );
	auvyx_catalog_assert( false !== strpos( $product->get_description(), '<p>Second paragraph.</p>' ), 'Description paragraphs.' );
	$taxonomies = array_keys( $product->get_attributes() );
	sort( $taxonomies );
	auvyx_catalog_assert( array( 'pa_color', 'pa_storage' ) === $taxonomies, 'Global attributes pa_color and pa_storage.' );
	auvyx_catalog_assert( $product->get_attributes()['pa_color']->get_variation() && $product->get_attributes()['pa_color']->get_visible(), 'Attribute is visible and used for variations.' );
	$black = get_term_by( 'slug', 'black', 'pa_color' );
	auvyx_catalog_assert( $black && 'Black' === $black->name && '#111111' === get_term_meta( $black->term_id, 'auvyx_swatch_color', true ), 'Term slug is the value key, name its label, colour swatch stored.' );
	$types = get_option( 'auvyx_woo_attribute_types' );
	auvyx_catalog_assert( 'color' === ( $types['color'] ?? '' ) && 'button' === ( $types['storage'] ?? '' ), 'Swatch types: color kind → color, label kind → button.' );
	auvyx_catalog_assert( array(
		'pa_color'   => 'black',
		'pa_storage' => '128',
	) === $product->get_default_attributes(), 'Defaults come from the first valid variant.' );
	$variation = wc_get_product( wc_get_product_id_by_sku( 'auvyx-demo-electronics-test-phone-black-256' ) );
	auvyx_catalog_assert( $variation instanceof WC_Product_Variation && '799' === $variation->get_price() && 'outofstock' === $variation->get_stock_status(), 'Variant price override and stock.' );
	auvyx_catalog_assert( array(
		'pa_color'   => 'black',
		'pa_storage' => '256',
	) === $variation->get_attributes(), 'Variation options map to term slugs.' );
	$first = wc_get_product( wc_get_product_id_by_sku( 'auvyx-demo-electronics-test-phone-black-128' ) );
	auvyx_catalog_assert( '649' === $first->get_price() && 5 === $first->get_stock_quantity(), 'Product price (sale) when the variant has none.' );
	auvyx_catalog_assert( $first->get_image_id() > 0 && is_file( get_attached_file( $first->get_image_id() ) ), 'Variant image sideloaded.' );
	auvyx_catalog_assert( hash( 'sha256', $photo_a ) === get_post_meta( $first->get_image_id(), '_auvyx_demo_media_sha256', true ), 'Variant image passed the hash check.' );
	auvyx_catalog_assert( 'electronics' === get_post_meta( $first->get_id(), '_auvyx_demo_catalog', true ), 'Variation carries the ownership marker.' );
	auvyx_catalog_assert( 649.0 === (float) wc_get_product( $one['id'] )->get_variation_price( 'min' ) && 799.0 === (float) wc_get_product( $one['id'] )->get_variation_price( 'max' ), 'Parent price range is synced.' );

	// Simple path is kept, reusing the cached pack and the photo already in the Library.
	$case = DemoCatalog::import( 'electronics', 'test-case' );
	auvyx_catalog_assert( ! is_wp_error( $case ) && wc_get_product( $case['id'] ) instanceof WC_Product_Simple, 'Simple product path.' );
	auvyx_catalog_assert( 1 === $packs, 'Fresh cache: no new pack request.' );
	auvyx_catalog_assert( '15' === wc_get_product( $case['id'] )->get_price() && 7 === wc_get_product( $case['id'] )->get_stock_quantity(), 'Simple sale price and stock.' );

	// Retry reuses the SKU and photos; refresh keeps IDs and does not duplicate variations.
	$before = $requests;
	$again  = DemoCatalog::import( 'electronics', 'test-phone' );
	auvyx_catalog_assert( $again['id'] === $one['id'] && false === $again['created'] && $before === $requests, 'Retry reuses SKU and attachments.' );
	$refresh = DemoCatalog::import( 'electronics', 'test-phone', true );
	auvyx_catalog_assert( $refresh['id'] === $one['id'] && 3 === count( wc_get_product( $one['id'] )->get_children() ) && $before === $requests, 'Refresh keeps the product ID and variations.' );

	// 304: a stale cache is revalidated with its ETag and kept.
	$cached = get_transient( 'auvyx_demo_pack_electronics' );
	auvyx_catalog_assert( ! empty( $cached['etag'] ), 'Pack cached with its ETag.' );
	$cached['checked'] = time() - DemoCatalog::REVALIDATE - 1;
	set_transient( 'auvyx_demo_pack_electronics', $cached, HOUR_IN_SECONDS );
	$count = DemoCatalog::catalog( 'electronics' );
	auvyx_catalog_assert( 2 === $packs && ( $sent['If-None-Match'] ?? '' ) === $cached['etag'] && 4 === count( $count['products'] ), '304 revalidation sends If-None-Match and keeps the cached pack.' );
	auvyx_catalog_assert( time() - (int) get_transient( 'auvyx_demo_pack_electronics' )['checked'] < 5, '304 refreshes the check time.' );

	// Integrity: declared hash differs from the bytes served.
	$mismatch = DemoCatalog::import( 'electronics', 'test-bad' );
	auvyx_catalog_assert( is_wp_error( $mismatch ) && 'auvyx_demo_media_hash' === $mismatch->get_error_code() && 0 === wc_get_product_id_by_sku( 'auvyx-demo-electronics-test-bad' ), 'Bad media hash is rejected, nothing published.' );

	// Pack failures leave no catalog (Auvyx Builder ships none) and are never cached.
	foreach ( array( 'badhash', 'offline' ) as $case_mode ) {
		auvyx_catalog_forget( 'electronics' );
		$mode = $case_mode;
		auvyx_catalog_assert( array() === DemoCatalog::catalog( 'electronics' ) && false === get_transient( 'auvyx_demo_pack_electronics' ), "No catalog on {$case_mode}." );
	}
	auvyx_catalog_forget( 'electronics' );
	$mode    = 'ok';
	$padding = true;
	auvyx_catalog_assert( array() === DemoCatalog::catalog( 'electronics' ), 'An oversized pack is refused.' );
	$padding = false;
	auvyx_catalog_forget( 'electronics' );
	auvyx_catalog_assert( 4 === count( DemoCatalog::catalog( 'electronics' )['products'] ), 'Cloud pack is used again once it answers.' );

	// A local catalog: a folder added by a child theme, photos by paths relative to it, copied into the Media Library.
	$add_dir = static function ( $dirs ) use ( $fixtures ) {
		$dirs[] = $fixtures;
		return $dirs;
	};
	add_filter( 'auvyx_builder_demo_catalog_dirs', $add_dir );
	$packs_before    = $packs;
	$requests_before = $requests;
	$local           = DemoCatalog::import( 'shop', 'mug' );
	auvyx_catalog_assert( ! is_wp_error( $local ), is_wp_error( $local ) ? $local->get_error_message() : 'Local import failed.' );
	$mug = wc_get_product( $local['id'] );
	auvyx_catalog_assert( $mug instanceof WC_Product_Simple && '12' === $mug->get_price() && 1 === count( $mug->get_gallery_image_ids() ), 'Local catalog product with its photos.' );
	auvyx_catalog_assert( $packs_before === $packs && $requests_before === $requests, 'A local catalog asks the network nothing.' );
	$mug_image = $mug->get_image_id();
	auvyx_catalog_assert( is_file( get_attached_file( $mug_image ) ) && hash( 'sha256', $photo_a ) === get_post_meta( $mug_image, '_auvyx_demo_media_sha256', true ), 'The local photo is copied into the Media Library.' );
	auvyx_catalog_assert( 'local:shop/images/products/red.jpg' === get_post_meta( $mug_image, '_auvyx_demo_image_source', true ), 'The copy records its source.' );
	auvyx_catalog_assert( is_file( $fixtures . '/images/products/red.jpg' ), 'The theme keeps its own file.' );
	foreach ( array( 'up', 'remote', 'missing' ) as $refused ) {
		$r = DemoCatalog::import( 'shop', $refused );
		auvyx_catalog_assert( is_wp_error( $r ) && 'auvyx_demo_image_url' === $r->get_error_code() && 0 === wc_get_product_id_by_sku( 'auvyx-demo-shop-' . $refused ), "Local photo refused: {$refused}." );
	}
	$local_again = DemoCatalog::import( 'shop', 'mug', true );
	auvyx_catalog_assert( $local_again['id'] === $local['id'] && wc_get_product( $local['id'] )->get_image_id() === $mug_image, 'A refresh reuses the copied photo.' );
	$local_removed = DemoCatalog::remove( 'shop' );
	auvyx_catalog_assert( ! is_wp_error( $local_removed ) && false === wc_get_product( $local['id'] ) && ! get_post( $mug_image ), 'Removing the local demo removes its product and photos.' );
	remove_filter( 'auvyx_builder_demo_catalog_dirs', $add_dir );
	auvyx_catalog_assert( array() === DemoCatalog::catalog( 'shop' ), 'Without the folder, no local catalog.' );

	// Never overwrite an unowned SKU.
	$collision = new WC_Product_Simple();
	$collision->set_name( 'Existing shop product' );
	$collision->set_sku( 'auvyx-demo-electronics-test-collide' );
	$collision->save();
	auvyx_catalog_assert( is_wp_error( DemoCatalog::import( 'electronics', 'test-collide' ) ), 'Never overwrite unowned SKU.' );

	// A customer reuses one of our photos: removal must keep it.
	$kept_image = wc_get_product( $case['id'] )->get_image_id();
	$unrelated->set_image_id( $kept_image );
	$unrelated->save();

	// Remove: capability + nonce.
	wp_set_current_user( 0 );
	$anon = rest_do_request( new WP_REST_Request( 'POST', '/auvyx/v1/demo-catalogs/electronics/test-phone' ) );
	auvyx_catalog_assert( $anon->get_status() >= 400, 'Anonymous writes rejected.' );
	wp_set_current_user( 1 );
	$no_nonce = rest_do_request( new WP_REST_Request( 'POST', '/auvyx/v1/demo-catalogs/electronics/remove' ) );
	auvyx_catalog_assert( $no_nonce->get_status() >= 400 && wc_get_product( $one['id'] ), 'Remove without a nonce is rejected.' );
	$request = new WP_REST_Request( 'POST', '/auvyx/v1/demo-catalogs/electronics/remove' );
	$request->set_header( 'X-WP-Nonce', wp_create_nonce( 'wp_rest' ) );
	$removed = rest_do_request( $request );
	auvyx_catalog_assert( 200 === $removed->get_status() && $removed->get_data()['removed'] >= 2, 'Remove with capability and nonce.' );

	auvyx_catalog_assert( false === wc_get_product( $one['id'] ) && 0 === wc_get_product_id_by_sku( 'auvyx-demo-electronics-test-phone-black-256' ), 'Owned product and variations are gone.' );
	auvyx_catalog_assert( ! get_term_by( 'slug', 'blue', 'pa_color' ) && 0 === wc_attribute_taxonomy_id_by_name( 'color' ) && ! get_option( 'auvyx_demo_attribute_color' ), 'Created attribute and its terms are gone.' );
	auvyx_catalog_assert( ! isset( get_option( 'auvyx_woo_attribute_types', array() )['color'] ), 'Created swatch type is gone.' );
	auvyx_catalog_assert( ! term_exists( 'Phones', 'product_cat' ) && term_exists( 'Gadgets', 'product_cat' ), 'Created category gone, pre-existing category kept.' );
	auvyx_catalog_assert( wc_attribute_taxonomy_id_by_name( 'storage' ) > 0 && get_term_by( 'slug', '128', 'pa_storage' ) && ! get_term_by( 'slug', '256', 'pa_storage' ), 'Pre-existing attribute and term kept; only the created term goes.' );
	auvyx_catalog_assert( wc_get_product( $unrelated->get_id() ) && get_post( $stray ), 'Unrelated product and attachment kept.' );
	auvyx_catalog_assert( get_post( $kept_image ) && is_file( get_attached_file( $kept_image ) ), 'A photo still used elsewhere is kept.' );
	auvyx_catalog_assert( 0 === count( get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'meta_key' => '_auvyx_demo_media_sha256', 'meta_value' => hash( 'sha256', $photo_b ), 'numberposts' => 1 ) ) ), 'Unreferenced imported photos are gone.' ); // phpcs:ignore WordPress.DB.SlowDBQuery
	echo "AUVYX_CATALOG_TESTS_PASSED\n";
} catch ( Throwable $e ) {
	echo 'AUVYX_CATALOG_TESTS_FAILED: ', $e->getMessage(), ' @', $e->getLine(), "\n";
}
