<?php
/**
 * Pictures from another site, copied into this one's Media Library: an import from another builder (Elementor) points
 * at the old site's uploads, which go away with it. One picture per request, by URL; the same URL is copied once.
 * The download goes through WordPress' safe HTTP (no local or private addresses), and only raster images are kept.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\MediaImport;

use Auvyx\Builder\Module;

defined( 'ABSPATH' ) || exit;

final class MediaImport implements Module {

	/** The address an attachment was copied from (so a second import reuses it). */
	const SOURCE = '_auvyx_imported_from';
	const LIMIT  = 15728640;
	const TYPES  = array( 'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif' );

	public function id(): string {
		return 'media-import';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'routes' ) );
	}

	public function routes(): void {
		register_rest_route(
			'auvyx/v1',
			'/media/sideload',
			array(
				'methods'             => 'POST',
				'permission_callback' => static fn() => current_user_can( 'upload_files' ),
				'args'                => array(
					'url' => array(
						'type'     => 'string',
						'required' => true,
					),
					'alt' => array(
						'type'    => 'string',
						'default' => '',
					),
				),
				'callback'            => static function ( $request ) {
					$result = self::sideload( (string) $request['url'], (string) $request['alt'] );
					if ( is_wp_error( $result ) ) {
						return $result;
					}
					return new \WP_REST_Response(
						array(
							'id'  => $result,
							'url' => wp_get_attachment_url( $result ),
						)
					);
				},
			)
		);
	}

	/**
	 * Copies the picture at $url into the Media Library, or finds the copy made before.
	 *
	 * @return int|\WP_Error The attachment id.
	 */
	public static function sideload( string $url, string $alt = '' ) {
		$url  = esc_url_raw( trim( $url ), array( 'http', 'https' ) );
		$host = strtolower( trim( (string) wp_parse_url( $url, PHP_URL_HOST ), '[].' ) );
		// A literal loopback or private address is refused here; names that resolve to one are refused by the safe
		// download below (download_url → wp_safe_remote_get).
		$ip = filter_var( $host, FILTER_VALIDATE_IP );
		if ( '' === $url || '' === $host || 'localhost' === $host || ( false !== $ip && ! filter_var( $host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE ) ) ) {
			return new \WP_Error( 'auvyx_media_url', 'Not a picture address this site can fetch.', array( 'status' => 400 ) );
		}
		$path = (string) wp_parse_url( $url, PHP_URL_PATH );
		$name = sanitize_file_name( wp_basename( $path ) );
		$ext  = strtolower( pathinfo( $name, PATHINFO_EXTENSION ) );
		if ( '' !== $ext && ! in_array( $ext, self::TYPES, true ) ) {
			return new \WP_Error( 'auvyx_media_type', 'Only JPEG, PNG, GIF, WebP and AVIF pictures are copied.', array( 'status' => 400 ) );
		}
		$found = get_posts(
			array(
				'post_type'   => 'attachment',
				'post_status' => 'inherit',
				'numberposts' => 1,
				'fields'      => 'ids',
				'meta_key'    => self::SOURCE, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'  => $url, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			)
		);
		if ( $found && wp_get_attachment_url( $found[0] ) ) {
			return (int) $found[0];
		}
		if ( ! function_exists( 'media_handle_sideload' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';
		}
		$temp = download_url( $url, 20 );
		if ( is_wp_error( $temp ) ) {
			return new \WP_Error( 'auvyx_media_download', 'Could not download the picture: ' . $temp->get_error_message(), array( 'status' => 502 ) );
		}
		$size = (int) filesize( $temp );
		$mime = function_exists( 'wp_get_image_mime' ) ? wp_get_image_mime( $temp ) : false;
		$kind = array(
			'image/jpeg' => 'jpg',
			'image/png'  => 'png',
			'image/gif'  => 'gif',
			'image/webp' => 'webp',
			'image/avif' => 'avif',
		);
		if ( $size <= 0 || $size > self::LIMIT || ! $mime || ! isset( $kind[ $mime ] ) ) {
			wp_delete_file( $temp );
			return new \WP_Error( 'auvyx_media_type', 'The address did not answer with a picture (or it is over 15 MB).', array( 'status' => 400 ) );
		}
		// A name without an extension (a CDN address) takes the one its bytes say.
		if ( '' === $ext ) {
			$name = ( '' !== $name ? $name : 'picture' ) . '.' . $kind[ $mime ];
		}
		$id = media_handle_sideload(
			array(
				'name'     => $name,
				'tmp_name' => $temp,
			),
			0,
			sanitize_text_field( $alt )
		);
		if ( is_wp_error( $id ) ) {
			wp_delete_file( $temp );
			return $id;
		}
		update_post_meta( $id, self::SOURCE, $url );
		if ( '' !== trim( $alt ) ) {
			update_post_meta( $id, '_wp_attachment_image_alt', sanitize_text_field( $alt ) );
		}
		return (int) $id;
	}
}
