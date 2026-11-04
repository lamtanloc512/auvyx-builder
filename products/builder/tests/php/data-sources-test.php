<?php
/**
 * Data sources: parity with the Studio (shared/fixtures/data-sources/cases.json), storage, loops and bindings.
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\DataSources\DataSources;
use Auvyx\Builder\Plugin;

$auvyx_ds_fixtures = json_decode( (string) file_get_contents( AUVYX_SHARED_DIR . '/fixtures/data-sources/cases.json' ), true );

foreach ( $auvyx_ds_fixtures['items'] as $auvyx_case ) {
	auvyx_test(
		'data items parity: ' . $auvyx_case['name'],
		static function () use ( $auvyx_case ) {
			$spec = DataSources::validate( $auvyx_case['spec'] );
			auvyx_assert_same( true, is_array( $spec ), is_string( $spec ) ? $spec : 'valid' );
			$result = DataSources::parse( $auvyx_case['answer'], $spec, $auvyx_case['limit'] ?? DataSources::MAX_ITEMS );
			if ( isset( $auvyx_case['expected']['items'] ) ) {
				auvyx_assert_same( $auvyx_case['expected']['items'], $result );
			} else {
				auvyx_assert_same( true, is_wp_error( $result ), 'an error' );
			}
		}
	);
}

foreach ( $auvyx_ds_fixtures['validate'] as $auvyx_case ) {
	auvyx_test(
		'data validate parity: ' . $auvyx_case['name'],
		static function () use ( $auvyx_case ) {
			auvyx_assert_same( $auvyx_case['valid'], is_array( DataSources::validate( $auvyx_case['spec'] ) ) );
		}
	);
}

auvyx_test(
	'a loop over a data source renders its items on the server, tokens never shown back',
	static function () {
		$answer = static function ( $pre, $args, $url ) {
			if ( 'https://api.example.com/products' !== $url ) {
				return $pre;
			}
			auvyx_assert_same( 'Bearer secret-token', $args['headers']['Authorization'] ?? '', 'the stored token is sent' );
			return array(
				'response' => array( 'code' => 200 ),
				'headers'  => array(),
				'body'     => '{"items":[{"name":"Tee","price":12.5,"img":"https://cdn.example.com/t.jpg"},{"name":"Mug","price":8,"img":""}]}',
			);
		};
		add_filter( 'pre_http_request', $answer, 10, 3 );
		DataSources::save(
			DataSources::validate(
				array(
					'name'    => 'shop',
					'label'   => 'Shop API',
					'url'     => 'https://api.example.com/products',
					'headers' => array( 'Authorization' => 'Bearer secret-token' ),
					'list'    => 'items',
					'fields'  => array(
						'title' => 'name',
						'price' => 'price',
						'image' => 'img',
					),
				)
			)
		);
		auvyx_assert_same( '', DataSources::all()['shop']['headers']['Authorization'], 'header values are blank when listed' );
		auvyx_assert_not_contains( 'secret-token', (string) wp_json_encode( get_option( DataSources::OPTION ) ), 'stored encrypted' );

		$content = '<!-- wp:auvyx/loop {"query":{"postType":"data","source":"data/shop","perPage":5}} -->'
			. '<!-- wp:auvyx/heading {"metadata":{"bindings":{"content":{"source":"auvyx/data","args":{"key":"data/title"}}}}} --><h2 class="wp-block-auvyx-heading">Name</h2><!-- /wp:auvyx/heading -->'
			. '<!-- wp:auvyx/text {"metadata":{"bindings":{"content":{"source":"auvyx/data","args":{"key":"data/price"}}}}} --><p class="wp-block-auvyx-text">Price</p><!-- /wp:auvyx/text -->'
			. '<!-- /wp:auvyx/loop -->';
		$html    = do_blocks( $content );
		auvyx_assert_contains( '>Tee</h2>', $html );
		auvyx_assert_contains( '>12.5</p>', $html );
		auvyx_assert_contains( '>Mug</h2>', $html );
		auvyx_assert_contains( '>8</p>', $html );

		$config = Plugin::instance()->module( 'data' ) ? \Auvyx\Builder\Modules\Data\Data::studio_config( 0 ) : array();
		auvyx_assert_same( true, in_array( 'data/shop', array_column( $config['sources'], 'key' ), true ), 'the Studio lists the source' );
		auvyx_assert_same( true, in_array( 'data/image', array_column( $config['fields'], 'key' ), true ), 'and its fields' );

		remove_filter( 'pre_http_request', $answer, 10 );
		DataSources::remove( 'shop' );
		auvyx_assert_same( array(), DataSources::all() );
	}
);

auvyx_test(
	'only an administrator saves data sources; editors read them',
	static function () {
		$editor = wp_insert_user( array( 'user_login' => 'ds-editor', 'user_pass' => wp_generate_password(), 'role' => 'editor' ) );
		wp_set_current_user( $editor );
		$request = new WP_REST_Request( 'POST', '/auvyx/v1/data-sources' );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( '{"name":"x","url":"https://api.example.com/x","fields":{"a":"a"}}' );
		auvyx_assert_same( 403, rest_do_request( $request )->get_status() );
		auvyx_assert_same( 200, rest_do_request( new WP_REST_Request( 'GET', '/auvyx/v1/data-sources' ) )->get_status() );
		wp_set_current_user( 1 );
	}
);

auvyx_test(
	'a public source is read by anyone at /auvyx/v1/data/{name}: its fields only; a source that is not public is not there',
	static function () {
		$answer = static function ( $pre, $args, $url ) {
			return 'https://api.example.com/open' === $url ? array(
				'response' => array( 'code' => 200 ),
				'headers'  => array(),
				'body'     => '{"items":[{"name":"Tee","secret":"x"}]}',
			) : $pre;
		};
		add_filter( 'pre_http_request', $answer, 10, 3 );
		$spec = array(
			'name'    => 'open',
			'url'     => 'https://api.example.com/open',
			'headers' => array( 'Authorization' => 'Bearer hidden' ),
			'list'    => 'items',
			'fields'  => array( 'title' => 'name' ),
			'ttl'     => 60,
		);
		DataSources::save( DataSources::validate( $spec ) );
		wp_set_current_user( 0 );
		auvyx_assert_same( 404, rest_do_request( new WP_REST_Request( 'GET', '/auvyx/v1/data/open' ) )->get_status(), 'not public yet' );
		wp_set_current_user( 1 );
		DataSources::save( DataSources::validate( array_merge( $spec, array( 'public' => true ) ) ) );
		wp_set_current_user( 0 );
		$response = rest_do_request( new WP_REST_Request( 'GET', '/auvyx/v1/data/open' ) );
		auvyx_assert_same( 200, $response->get_status() );
		auvyx_assert_same( array( array( 'data/title' => 'Tee' ) ), $response->get_data() );
		auvyx_assert_not_contains( 'hidden', (string) wp_json_encode( $response->get_data() ) );
		auvyx_assert_same( 'string', gettype( DataSources::validate( array_merge( $spec, array( 'public' => true, 'ttl' => 0 ) ) ) ), 'a public source asked on every view is refused' );
		wp_set_current_user( 1 );
		remove_filter( 'pre_http_request', $answer, 10 );
		DataSources::remove( 'open' );
	}
);
