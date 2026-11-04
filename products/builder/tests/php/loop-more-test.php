<?php
/**
 * Load more and infinite scroll on paginated Auvyx loops (Modules/LoopMore).
 *
 * @package Auvyx\Builder
 */

auvyx_test(
	'loop more: a paginated loop keeps its page numbers and asks for the script with its key',
	static function () {
		for ( $i = 1; $i <= 3; $i++ ) {
			wp_insert_post(
				array(
					'post_type'   => 'post',
					'post_status' => 'publish',
					'post_title'  => 'More ' . $i,
				)
			);
		}
		$query = array(
			'postType' => 'post',
			'perPage'  => 1,
			'paginate' => true,
			'more'     => 'button',
		);
		$block = '<!-- wp:auvyx/loop ' . wp_json_encode( array( 'query' => $query ) ) . ' --><div class="wp-block-auvyx-loop"><!-- wp:auvyx/heading --><h2 class="wp-block-auvyx-heading">T</h2><!-- /wp:auvyx/heading --></div><!-- /wp:auvyx/loop -->';
		$html  = do_blocks( $block );
		$param = 'auvyxp' . substr( md5( (string) wp_json_encode( $query ) ), 0, 6 );
		auvyx_assert_contains( 'data-auvyx-more="button"', $html );
		auvyx_assert_contains( 'data-auvyx-more-key="' . $param . '"', $html, 'the same key on every page of this loop' );
		auvyx_assert_contains( 'data-auvyx-more-label="Load more"', $html );
		auvyx_assert_contains( 'class="auvyx-loop__pages"', $html, 'numbers stay for visitors without JavaScript' );
		auvyx_assert_contains( $param . '=2', $html, 'the next page is a plain URL' );
		auvyx_assert_same( true, wp_script_is( 'auvyx-loop-more', 'enqueued' ) );

		$query['more'] = 'scroll';
		auvyx_assert_contains( 'data-auvyx-more="scroll"', do_blocks( '<!-- wp:auvyx/loop ' . wp_json_encode( array( 'query' => $query ) ) . ' --><div class="wp-block-auvyx-loop"></div><!-- /wp:auvyx/loop -->' ) );
	}
);

auvyx_test(
	'loop more: page numbers (or no paging) add nothing, and unknown modes are ignored',
	static function () {
		$plain = do_blocks( '<!-- wp:auvyx/loop {"query":{"postType":"post","perPage":1,"paginate":true}} --><div class="wp-block-auvyx-loop"></div><!-- /wp:auvyx/loop -->' );
		auvyx_assert_not_contains( 'data-auvyx-more', $plain );
		$unpaged = do_blocks( '<!-- wp:auvyx/loop {"query":{"postType":"post","perPage":1,"more":"button"}} --><div class="wp-block-auvyx-loop"></div><!-- /wp:auvyx/loop -->' );
		auvyx_assert_not_contains( 'data-auvyx-more', $unpaged );
		auvyx_assert_same( array(), Auvyx\Builder\Modules\LoopMore\LoopMore::attributes( 'bogus', 'k' ) );
		$attrs = Auvyx\Builder\Modules\LoopMore\LoopMore::attributes( 'scroll', 'shop"><x' );
		auvyx_assert_same( 'shopx', $attrs['data-auvyx-more-key'] );
	}
);
