<?php
/**
 * WordPress data in Auvyx elements (Modules/Data) and the Posts loop block.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Data\Data;
use Auvyx\Builder\Modules\Studio\Studio;

/** Block comment attributes binding `$attr` to `$key`. */
function auvyx_test_bind( string $attr, string $key, array $extra = array() ): string {
	return wp_json_encode( $extra + array( 'metadata' => array( 'bindings' => array( $attr => array( 'source' => 'auvyx/data', 'args' => array( 'key' => $key ) ) ) ) ) );
}

function auvyx_test_post( string $title, array $meta = array() ): int {
	$id = wp_insert_post(
		array(
			'post_type'    => 'post',
			'post_status'  => 'publish',
			'post_title'   => $title,
			'post_excerpt' => 'Excerpt of ' . $title,
			'post_date'    => '2026-01-0' . wp_rand( 1, 9 ) . ' 10:00:00',
		)
	);
	foreach ( $meta as $key => $value ) {
		update_post_meta( $id, $key, $value );
	}
	return (int) $id;
}

auvyx_test(
	'data: bound heading, button link and custom field render the post values (escaped)',
	static function () {
		register_post_meta( 'post', 'subtitle', array( 'show_in_rest' => true, 'single' => true, 'type' => 'string' ) );
		register_post_meta( 'post', 'price_note', array( 'show_in_rest' => true, 'single' => true, 'type' => 'string' ) );
		$id = auvyx_test_post( 'Bound <b>title</b> & co', array( 'subtitle' => 'Sub <script>x</script>', '_secret' => 'hidden' ) );
		$GLOBALS['post'] = get_post( $id ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		setup_postdata( $GLOBALS['post'] );
		$html = do_blocks(
			'<!-- wp:auvyx/heading ' . auvyx_test_bind( 'content', 'post_title' ) . ' --><h2 class="wp-block-auvyx-heading">Placeholder</h2><!-- /wp:auvyx/heading -->'
			. '<!-- wp:auvyx/text ' . auvyx_test_bind( 'content', 'meta:subtitle' ) . ' --><p class="wp-block-auvyx-text">x</p><!-- /wp:auvyx/text -->'
			. '<!-- wp:auvyx/text ' . auvyx_test_bind( 'content', 'meta:_secret' ) . ' --><p class="wp-block-auvyx-text">static</p><!-- /wp:auvyx/text -->'
			. '<!-- wp:auvyx/button ' . auvyx_test_bind( 'url', 'post_url' ) . ' --><a class="wp-block-auvyx-button" href="#">Read</a><!-- /wp:auvyx/button -->'
		);
		wp_reset_postdata();
		auvyx_assert_contains( '>Bound title &amp; co</h2>', $html );
		auvyx_assert_not_contains( 'Placeholder', $html );
		auvyx_assert_contains( 'Sub &lt;script&gt;x&lt;/script&gt;', $html );
		auvyx_assert_not_contains( 'hidden', $html, 'protected meta is never read' );
		auvyx_assert_contains( '>static</p>', $html, 'an invalid key leaves the static text' );
		auvyx_assert_contains( 'href="' . esc_url( get_permalink( $id ) ) . '"', $html );
		// Unregistered custom fields (another plugin's data) are never shown.
		update_post_meta( $id, 'private_phone', '555-0100' );
		auvyx_assert_same( '', Auvyx\Builder\Modules\Data\Data::value( 'meta:private_phone', $id ) );
		auvyx_assert_same( false, array_key_exists( 'meta:private_phone', Auvyx\Builder\Modules\Data\Data::values( $id ) ) );
	}
);

auvyx_test(
	'data: a bound image without a featured image renders nothing',
	static function () {
		$id              = auvyx_test_post( 'No image' );
		$GLOBALS['post'] = get_post( $id ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		setup_postdata( $GLOBALS['post'] );
		$html = do_blocks( '<!-- wp:auvyx/image ' . auvyx_test_bind( 'url', 'featured_image' ) . ' --><img class="wp-block-auvyx-image" src="https://example.com/a.jpg" alt=""/><!-- /wp:auvyx/image -->' );
		wp_reset_postdata();
		auvyx_assert_same( '', trim( $html ) );
	}
);

auvyx_test(
	'data: private posts are not read for visitors',
	static function () {
		$id = wp_insert_post(
			array(
				'post_type'   => 'post',
				'post_status' => 'private',
				'post_title'  => 'Private title',
			)
		);
		$user = get_current_user_id();
		wp_set_current_user( 0 );
		$value = Data::value( 'post_title', (int) $id );
		wp_set_current_user( $user );
		auvyx_assert_same( '', $value );
		auvyx_assert_same( get_bloginfo( 'name' ), Data::value( 'site_title', 0 ) );
	}
);

auvyx_test(
	'loop: the template repeats per post with that post\'s fields',
	static function () {
		$type = 'auvyx_loop_' . wp_rand( 1000, 9999 );
		register_post_type( $type, array( 'public' => true ) );
		foreach ( array( 'Alpha', 'Beta', 'Gamma' ) as $i => $title ) {
			wp_insert_post(
				array(
					'post_type'   => $type,
					'post_status' => 'publish',
					'post_title'  => $title,
					'post_date'   => '2026-02-0' . ( $i + 1 ) . ' 10:00:00',
				)
			);
		}
		$query = wp_json_encode(
			array(
				'query' => array(
					'postType' => $type,
					'perPage'  => 2,
					'orderBy'  => 'title',
					'order'    => 'asc',
				),
			)
		);
		$html  = do_blocks(
			'<!-- wp:auvyx/loop ' . $query . ' --><div class="wp-block-auvyx-loop">'
			. '<!-- wp:auvyx/heading ' . auvyx_test_bind( 'content', 'post_title' ) . ' --><h2 class="wp-block-auvyx-heading">T</h2><!-- /wp:auvyx/heading -->'
			. '</div><!-- /wp:auvyx/loop -->'
		);
		auvyx_assert_contains( '<div class="wp-block-auvyx-loop"><h2 class="wp-block-auvyx-heading">Alpha</h2><h2 class="wp-block-auvyx-heading">Beta</h2></div>', $html );
		auvyx_assert_not_contains( 'Gamma', $html );
	}
);

auvyx_test(
	'loop: query args are clamped; unknown post types fall back to posts',
	static function () {
		$args = Data::query_args(
			array(
				'postType' => 'nope',
				'perPage'  => 999,
				'offset'   => -4,
				'orderBy'  => 'meta_value',
				'order'    => 'x',
			),
			7
		);
		auvyx_assert_same( 'post', $args['post_type'] );
		auvyx_assert_same( 50, $args['posts_per_page'] );
		auvyx_assert_same( 0, $args['offset'] );
		auvyx_assert_same( 'date', $args['orderby'] );
		auvyx_assert_same( 'DESC', $args['order'] );
		auvyx_assert_same( 'publish', $args['post_status'] );
		auvyx_assert_same( array( 7 ), $args['post__not_in'] );
	}
);

auvyx_test(
	'data: a heading bound to a link wraps its words in it, whichever binding comes first; no address leaves plain words',
	static function () {
		$id = auvyx_test_post( 'Linen <i>shirt</i>' );
		$GLOBALS['post'] = get_post( $id ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		setup_postdata( $GLOBALS['post'] );
		$attrs = wp_json_encode(
			array(
				'metadata' => array(
					'bindings' => array(
						'href'    => array( 'source' => 'auvyx/data', 'args' => array( 'key' => 'post_url' ) ),
						'content' => array( 'source' => 'auvyx/data', 'args' => array( 'key' => 'post_title' ) ),
					),
				),
			)
		);
		$html = do_blocks( '<!-- wp:auvyx/heading ' . $attrs . ' --><h3 class="wp-block-auvyx-heading">Product name</h3><!-- /wp:auvyx/heading -->' );
		$none = do_blocks( '<!-- wp:auvyx/heading ' . auvyx_test_bind( 'href', 'meta:nothing' ) . ' --><h3 class="wp-block-auvyx-heading">Static</h3><!-- /wp:auvyx/heading -->' );
		wp_reset_postdata();
		auvyx_assert_contains( '<h3 class="wp-block-auvyx-heading"><a class="auvyx-heading-link" href="' . esc_url( get_permalink( $id ) ) . '">Linen shirt</a></h3>', $html );
		auvyx_assert_contains( '<h3 class="wp-block-auvyx-heading">Static</h3>', $none );
	}
);

auvyx_test(
	'loop: menu order ties are settled by title, as WooCommerce sorts',
	static function () {
		$args = Data::query_args(
			array(
				'orderBy' => 'menu_order',
				'order'   => 'asc',
			)
		);
		auvyx_assert_same(
			array(
				'menu_order' => 'ASC',
				'title'      => 'ASC',
			),
			$args['orderby']
		);
	}
);

auvyx_test(
	'studio: bindings and loop query are imported; config carries the post values',
	static function () {
		$tree = Studio::tree(
			parse_blocks(
				'<!-- wp:auvyx/loop {"query":{"postType":"page","perPage":4,"inherit":true}} --><div class="wp-block-auvyx-loop">'
				. '<!-- wp:auvyx/heading ' . auvyx_test_bind( 'content', 'post_title' ) . ' --><h2 class="wp-block-auvyx-heading">T</h2><!-- /wp:auvyx/heading -->'
				. '</div><!-- /wp:auvyx/loop -->'
			)
		);
		auvyx_assert_same( 'auvyx/loop', $tree[0]['block'] );
		auvyx_assert_same( 'page', $tree[0]['query']->postType );
		auvyx_assert_same( '4', $tree[0]['query']->perPage );
		auvyx_assert_same( 'true', $tree[0]['query']->inherit );
		auvyx_assert_same( 'post_title', $tree[0]['children'][0]['bind']->content );
		$id     = auvyx_test_post( 'Config post', array( 'price_note' => 'Free' ) );
		$config = Data::studio_config( $id );
		auvyx_assert_same( 'Config post', $config['values']['post_title'] );
		auvyx_assert_same( 'Free', $config['values']['meta:price_note'] );
	}
);

auvyx_test(
	'studio: dynamic blocks can be inserted with a server preview; unknown or child blocks cannot',
	static function () {
		$names = wp_list_pluck( Studio::block_types(), 'name' );
		auvyx_assert_same( true, in_array( 'core/latest-posts', $names, true ) );
		auvyx_assert_same( false, in_array( 'core/paragraph', $names, true ), 'static blocks need saved HTML' );
		auvyx_assert_same( false, in_array( 'core/post-template', $names, true ) );
		auvyx_assert_same( false, in_array( 'auvyx/loop', $names, true ) );
		$request = new WP_REST_Request( 'POST', '/auvyx/v1/render' );
		$request->set_param( 'block', 'core/latest-posts' );
		$response = rest_do_request( $request );
		auvyx_assert_same( 200, $response->get_status() );
		auvyx_assert_same( 'core/latest-posts', $response->get_data()['blocks'][0]['block'] );
		auvyx_assert_contains( 'wp-block-latest-posts', $response->get_data()['blocks'][0]['html'] );
		$request->set_param( 'attrs', array( 'postsToShow' => '2', 'displayPostDate' => 1, 'unknown' => 'x' ) );
		$raw = rest_do_request( $request )->get_data()['blocks'][0]['raw'];
		auvyx_assert_contains( '"postsToShow":2', $raw );
		auvyx_assert_contains( '"displayPostDate":true', $raw );
		auvyx_assert_not_contains( 'unknown', $raw );
		auvyx_assert_same( false, in_array( 'core/heading', $names, true ), 'content saved as HTML' );
		$request->set_param( 'block', 'core/html' );
		auvyx_assert_same( 400, rest_do_request( $request )->get_status() );
	}
);

auvyx_test(
	'studio: a block locked against moving opens locked',
	static function () {
		$tree = Studio::tree( parse_blocks( '<!-- wp:auvyx/section {"tagName":"div","lock":{"move":true}} --><div class="wp-block-auvyx-section"></div><!-- /wp:auvyx/section -->' ) );
		auvyx_assert_same( true, $tree[0]['locked'] );
	}
);

auvyx_test(
	'loop: filter by category and paginate with its own page parameter',
	static function () {
		$cat = wp_insert_term( 'Loop news ' . wp_rand( 100, 999 ), 'category' );
		for ( $i = 1; $i <= 3; $i++ ) {
			$id = wp_insert_post(
				array(
					'post_type'   => 'post',
					'post_status' => 'publish',
					'post_title'  => 'Filtered ' . $i,
					'post_date'   => '2026-03-0' . $i . ' 10:00:00',
				)
			);
			wp_set_post_terms( $id, array( $cat['term_id'] ), 'category' );
		}
		$slug  = get_term( $cat['term_id'] )->slug;
		$query = array(
			'postType' => 'post',
			'perPage'  => 2,
			'orderBy'  => 'title',
			'order'    => 'asc',
			'taxonomy' => 'category',
			'terms'    => $slug,
			'paginate' => true,
		);
		$block = '<!-- wp:auvyx/loop ' . wp_json_encode( array( 'query' => $query ) ) . ' --><div class="wp-block-auvyx-loop"><!-- wp:auvyx/heading ' . auvyx_test_bind( 'content', 'post_title' ) . ' --><h2 class="wp-block-auvyx-heading">T</h2><!-- /wp:auvyx/heading --></div><!-- /wp:auvyx/loop -->';
		$html  = do_blocks( $block );
		auvyx_assert_contains( '>Filtered 1</h2><h2 class="wp-block-auvyx-heading">Filtered 2</h2></div>', $html );
		auvyx_assert_contains( 'class="auvyx-loop__pages"', $html );
		$param          = 'auvyxp' . substr( md5( (string) wp_json_encode( $query ) ), 0, 6 );
		$_GET[ $param ] = '2';
		$html           = do_blocks( $block );
		unset( $_GET[ $param ] );
		auvyx_assert_contains( '>Filtered 3</h2></div>', $html );
		auvyx_assert_not_contains( 'Filtered 1', $html );
	}
);

auvyx_test(
	'data: plugins add namespaced fields and loop sources (ADR 0036); empty bound text renders nothing',
	static function () {
		$fields  = static function ( $f ) {
			$f['acme/badge'] = array(
				'label' => 'Badge',
				'group' => 'Acme',
				'shape' => 'text',
				'value' => static fn( $post ) => 'Hot' === $post->post_title ? '<b>Hot</b> pick' : '',
			);
			$f['Bad Key']    = array( 'value' => '__return_empty_string' );
			$f['acme/nofn']  = array( 'label' => 'x' );
			return $f;
		};
		$sources = static fn( $s ) => $s + array( 'acme/picked' => array( 'label' => 'Picked', 'postType' => 'post' ) );
		$seen    = array();
		$args    = static function ( $args, $source, $current ) use ( &$seen ) {
			$seen[] = $source;
			if ( 'acme/picked' === $source ) {
				$args['post__in'] = array( 1 );
			}
			return $args;
		};
		add_filter( 'auvyx_builder_data_fields', $fields );
		add_filter( 'auvyx_builder_loop_sources', $sources );
		add_filter( 'auvyx_builder_loop_query_args', $args, 10, 3 );
		$hot  = auvyx_test_post( 'Hot' );
		$cold = auvyx_test_post( 'Cold' );
		auvyx_assert_same( array( 'acme/badge' ), array_values( array_filter( array_keys( Data::extensions() ), static fn( $k ) => 0 === strpos( $k, 'acme/' ) ) ), 'other plugins (Auvyx Builder Pro) may add theirs' );
		auvyx_assert_same( true, Data::valid( 'acme/badge' ) );
		auvyx_assert_same( false, Data::valid( 'acme/nofn' ) );
		auvyx_assert_same( '<b>Hot</b> pick', Data::values( $hot )['acme/badge'] );
		$block = '<!-- wp:auvyx/text ' . auvyx_test_bind( 'content', 'acme/badge' ) . ' --><p class="wp-block-auvyx-text">Badge</p><!-- /wp:auvyx/text -->';
		$GLOBALS['post'] = get_post( $hot ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		setup_postdata( $GLOBALS['post'] );
		auvyx_assert_contains( '>&lt;b&gt;Hot&lt;/b&gt; pick</p>', do_blocks( $block ) );
		$GLOBALS['post'] = get_post( $cold ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		setup_postdata( $GLOBALS['post'] );
		auvyx_assert_same( '', trim( do_blocks( $block ) ), 'no value: no empty element' );
		wp_reset_postdata();
		$config = Data::studio_config( $hot );
		$acme   = array_values( array_filter( $config['fields'], static fn( $f ) => 0 === strpos( $f['key'], 'acme/' ) ) );
		auvyx_assert_same( array( 'key' => 'acme/badge', 'label' => 'Badge', 'group' => 'Acme', 'shape' => 'text' ), $acme[0] );
		auvyx_assert_same( array( 'key' => 'acme/picked', 'label' => 'Picked', 'postType' => 'post' ), $config['sources'][0] );
		auvyx_assert_same( array( 1 ), Data::query_args( array( 'source' => 'acme/picked' ) )['post__in'] );
		Data::query_args( array( 'source' => 'other/unknown' ) );
		auvyx_assert_same( array( 'acme/picked', '' ), $seen, 'unknown sources reach plugins as the plain query' );
		remove_filter( 'auvyx_builder_data_fields', $fields );
		remove_filter( 'auvyx_builder_loop_sources', $sources );
		remove_filter( 'auvyx_builder_loop_query_args', $args, 10 );
		auvyx_assert_same( false, Data::valid( 'acme/badge' ), 'plugin gone: the binding is ignored, the static text shows' );
	}
);

auvyx_test(
	'studio: plugin blocks with supports.auvyx take Studio styles and design properties; previews follow the loop item',
	static function () {
		register_block_type(
			'acme/card',
			array(
				'attributes'      => array(
					'size' => array(
						'type'    => 'string',
						'default' => 'm',
					),
					'auvyx'   => array( 'type' => 'object' ),
				),
				'supports'        => array(
					'auvyx' => array(
						'props' => array(
							array(
								'name'  => '--acme-bg',
								'label' => 'Background',
								'type'  => 'color',
								'group' => 'Card',
							),
							array( 'name' => 'not a property' ),
						),
					),
				),
				'uses_context'    => array( 'postId' ),
				'render_callback' => static fn( $attrs, $content, $block ) => '<div class="acme-card">post ' . (int) ( $block->context['postId'] ?? 0 ) . '</div>',
			)
		);
		$types = array_column( Studio::block_types(), null, 'name' );
		auvyx_assert_same(
			array(
				array(
					'name'  => '--acme-bg',
					'label' => 'Background',
					'type'  => 'color',
					'group' => 'Card',
				),
			),
			$types['acme/card']['design']
		);
		auvyx_assert_same( false, isset( $types['core/latest-posts']['design'] ), 'other blocks are not styleable' );
		// Saved styles move out of the markup into the element (Studio writes them back on save).
		$tree = Studio::tree( parse_blocks( '<!-- wp:acme/card {"size":"l","auvyx":{"v":1,"styles":{"base":{"default":{"--acme-bg":"red"}}}}} /-->' ) );
		auvyx_assert_same( 'red', $tree[0]['styles']['base']['default']['--acme-bg'] );
		auvyx_assert_same( '<!-- wp:acme/card {"size":"l"} /-->', $tree[0]['raw'] );
		// Rendered on the site with its Auvyx class.
		auvyx_assert_contains( 'class="acme-card auvyx-', do_blocks( '<!-- wp:acme/card {"auvyx":{"v":1,"styles":{"base":{"default":{"--acme-bg":"red"}}}}} /-->' ) );
		// Inside a loop, Studio renders it with the loop's first post.
		$id      = auvyx_test_post( 'Loop item' );
		$request = new WP_REST_Request( 'POST', '/auvyx/v1/render' );
		$request->set_param( 'block', 'acme/card' );
		$request->set_param( 'postId', $id );
		auvyx_assert_contains( 'post ' . $id, rest_do_request( $request )->get_data()['blocks'][0]['html'] );
		unregister_block_type( 'acme/card' );
		auvyx_assert_same( false, Auvyx\Builder\Modules\Patterns\Patterns::blocks_available( '<!-- wp:acme/card /-->' ), 'a pattern needing a missing plugin block is skipped' );
		auvyx_assert_same( true, Auvyx\Builder\Modules\Patterns\Patterns::blocks_available( '<!-- wp:auvyx/text --><p></p><!-- /wp:auvyx/text -->' ) );
	}
);

auvyx_test(
	'data: a button bound to an empty link renders nothing (no size guide, no button)',
	static function () {
		$field = static fn( $f ) => $f + array(
			'acme/guide' => array(
				'shape' => 'url',
				'value' => static fn( $post ) => 'With guide' === $post->post_title ? 'https://example.com/sizes' : '',
			),
		);
		add_filter( 'auvyx_builder_data_fields', $field );
		$block = '<!-- wp:auvyx/button ' . auvyx_test_bind( 'url', 'acme/guide' ) . ' --><a class="wp-block-auvyx-button" href="#">Size guide</a><!-- /wp:auvyx/button -->';
		foreach ( array( 'With guide' => 'href="https://example.com/sizes"', 'Without' => '' ) as $title => $expected ) {
			$GLOBALS['post'] = get_post( auvyx_test_post( $title ) ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
			setup_postdata( $GLOBALS['post'] );
			$html = trim( do_blocks( $block ) );
			'' === $expected ? auvyx_assert_same( '', $html ) : auvyx_assert_contains( $expected, $html );
		}
		wp_reset_postdata();
		remove_filter( 'auvyx_builder_data_fields', $field );
	}
);

auvyx_test(
	'data: hand-picked ids replace the query, in the picked order',
	static function () {
		$args = Data::query_args(
			array(
				'postType' => 'post',
				'include'  => '34,12,abc,34',
				'perPage'  => 3,
				'offset'   => 5,
				'taxonomy' => 'category',
				'terms'    => 'news',
			)
		);
		auvyx_assert_same( array( 34, 12 ), $args['post__in'] );
		auvyx_assert_same( 'post__in', $args['orderby'] );
		auvyx_assert_same( 2, $args['posts_per_page'] );
		auvyx_assert_same( 0, $args['offset'] );
		auvyx_assert_same( false, isset( $args['tax_query'] ), 'no category filter on picked items' );
	}
);

auvyx_test(
	'data: a bound image in a card of another post loads lazily; the page\'s own post image does not',
	static function () {
		$id    = auvyx_test_post( 'Card' );
		$image = wp_insert_attachment(
			array(
				'post_mime_type' => 'image/jpeg',
				'guid'           => 'https://example.com/card.jpg',
				'post_title'     => 'card',
			),
			false,
			$id
		);
		update_post_meta( $image, '_wp_attached_file', 'card.jpg' );
		wp_update_attachment_metadata( $image, array( 'width' => 800, 'height' => 800, 'file' => 'card.jpg', 'sizes' => array() ) );
		set_post_thumbnail( $id, $image );
		$block           = '<!-- wp:auvyx/image ' . auvyx_test_bind( 'url', 'featured_image' ) . ' --><img class="wp-block-auvyx-image" src="https://example.com/a.jpg" alt=""/><!-- /wp:auvyx/image -->';
		$GLOBALS['post'] = get_post( $id ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		setup_postdata( $GLOBALS['post'] );
		$card = do_blocks( $block );
		$GLOBALS['wp_query']->queried_object    = get_post( $id );
		$GLOBALS['wp_query']->queried_object_id = $id;
		$own = do_blocks( $block );
		$GLOBALS['wp_query']->queried_object    = null;
		$GLOBALS['wp_query']->queried_object_id = null;
		wp_reset_postdata();
		auvyx_assert_contains( 'loading="lazy"', $card );
		auvyx_assert_not_contains( 'loading="lazy"', $own );
	}
);

auvyx_test(
	'data: a post made with a picture address shows it as its featured image',
	static function () {
		$id = auvyx_test_post( 'Template post' );
		update_post_meta( $id, Auvyx\Builder\Modules\Data\Data::IMAGE, 'https://example.com/story.svg' );
		auvyx_assert_same( 'https://example.com/story.svg', Auvyx\Builder\Modules\Data\Data::value( 'featured_image', $id ) );
		auvyx_assert_same( 'Template post', Auvyx\Builder\Modules\Data\Data::value( 'featured_image_alt', $id ) );
		$GLOBALS['post'] = get_post( $id ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
		setup_postdata( $GLOBALS['post'] );
		$html = do_blocks( '<!-- wp:auvyx/image ' . auvyx_test_bind( 'url', 'featured_image' ) . ' --><img class="wp-block-auvyx-image" src="https://example.com/a.jpg" alt=""/><!-- /wp:auvyx/image -->' );
		wp_reset_postdata();
		auvyx_assert_contains( 'https://example.com/story.svg', $html );
	}
);
